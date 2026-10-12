import { createFileRoute } from "@tanstack/react-router";

import { type ImageType, MAX_IMAGE_BYTES, MAX_IMAGES, formatBytes, imageSize, sniffImageType } from "@/lib/attachments";
import { isDemo } from "@/lib/demo";
import { DAILY_PRIVATE_BYTES, MAX_PRIVATE_BODY, contentHash, parseMetadata, privateFieldsSchema } from "@/lib/private-feedback";

const json = (body: unknown, status = 200, headers?: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const DAY = 24 * 60 * 60 * 1000;
const sendFailed = () => json({ error: "Couldn't send. Try again." }, 500);

// The Private Feedback Widget's one write: fields, app metadata and up to four
// images in a single multipart request from the frame, which is same-origin
// with Heardsy. Reporters have no Heardsy account; the receiving workspace is
// named explicitly and only its authorized team reads what lands here.
export const Route = createFileRoute("/api/private-feedback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const origin = request.headers.get("origin");
        if (origin && origin !== new URL(request.url).origin) return json({ error: "Cross-origin requests are not allowed" }, 403);

        const [{ privateReceiver }, { localDev }] = await Promise.all([import("@/lib/private-receiver"), import("@/lib/session")]);
        const ws = await privateReceiver(request);
        if (!ws) return json({ error: "There is no inbox at this address." }, 404);
        if (isDemo(ws)) return json({ error: "Private feedback is off in the demo." }, 403);

        // Local dev has no edge in front of it to name the client.
        const ip = request.headers.get("cf-connecting-ip") ?? ((await localDev()) ? "local" : null);
        const { env } = await import("@openheard/env/server");
        const limiter = (env as unknown as { UPLOAD_IP_LIMIT?: { limit(o: { key: string }): Promise<{ success: boolean }> } }).UPLOAD_IP_LIMIT;
        if (!limiter || !ip) return json({ error: "Sending is unavailable right now. Try again later." }, 503);
        const allowed = await limiter.limit({ key: `private:${ip}` }).then((r) => r.success, () => false);
        if (!allowed) return json({ error: "Too many reports. Try again in a minute." }, 429, { "retry-after": "60" });

        const contentType = request.headers.get("content-type") ?? "";
        if (!contentType.toLowerCase().startsWith("multipart/form-data")) return json({ error: "Send the report as multipart form data." }, 415);
        const tooLarge = json({ error: `Reports can be up to ${formatBytes(MAX_PRIVATE_BODY)} with images.` }, 413);
        if (Number(request.headers.get("content-length") ?? "") > MAX_PRIVATE_BODY) return tooLarge;
        const { readCapped } = await import("@/lib/attachment-db");
        const body = await readCapped(request, MAX_PRIVATE_BODY);
        if (!body) return tooLarge;
        let form: FormData;
        try {
          form = await new Response(body as Uint8Array<ArrayBuffer>, { headers: { "content-type": contentType } }).formData();
        } catch {
          return json({ error: "The report could not be read." }, 400);
        }

        const text = (k: string) => {
          const v = form.get(k);
          return typeof v === "string" ? v : undefined;
        };
        const fields = privateFieldsSchema.safeParse({ submissionId: text("submissionId"), type: text("type"), title: text("title"), message: text("message"), name: text("name"), email: text("email") });
        if (!fields.success) return json({ error: fields.error.issues[0]?.message ?? "Check the form and try again." }, 400);
        const rawMetadata = form.get("metadata");
        if (rawMetadata !== null && typeof rawMetadata !== "string") return json({ error: "Metadata must be a JSON object." }, 400);
        const metadata = parseMetadata(rawMetadata);
        if (!metadata.ok) return json({ error: metadata.error }, 400);

        const files = form.getAll("images");
        if (files.length > MAX_IMAGES) return json({ error: `Up to ${MAX_IMAGES} images.` }, 400);
        const images: { contentType: ImageType; bytes: Uint8Array; width: number | null; height: number | null }[] = [];
        for (const file of files) {
          if (typeof file === "string") return json({ error: "Images must be files." }, 400);
          if (!file.size) return json({ error: "One of the images is empty." }, 400);
          if (file.size > MAX_IMAGE_BYTES) return json({ error: `Images can be up to ${formatBytes(MAX_IMAGE_BYTES)}.` }, 413);
          const bytes = new Uint8Array(await file.arrayBuffer());
          const type = sniffImageType(bytes);
          if (!type) return json({ error: "Images must be PNG, JPEG, GIF or WebP." }, 415);
          const size = imageSize(bytes, type);
          images.push({ contentType: type, bytes, width: size?.width ?? null, height: size?.height ?? null });
        }

        const [{ createDb, privateFeedback }, { and, eq, gt, sql }, { newId, objectKey, uploadsBucket }, { inBackground, sendPrivateFeedbackEmail }, { statusOfKind }] = await Promise.all([
          import("@openheard/db"),
          import("drizzle-orm"),
          import("@/lib/attachment-db"),
          import("@/lib/notify"),
          import("@/lib/status-db"),
        ]);
        const db = createDb();
        const data = fields.data;
        const hash = await contentHash(data, metadata.value, images);
        const receipt = { received: true, submissionId: data.submissionId };
        const existing = async () => {
          const [row] = await db
            .select({ contentHash: privateFeedback.contentHash })
            .from(privateFeedback)
            .where(and(eq(privateFeedback.workspaceId, ws.id), eq(privateFeedback.submissionId, data.submissionId)))
            .limit(1);
          if (!row) return null;
          return row.contentHash === hash ? json(receipt, 200) : json({ error: "This submission was already sent with different content." }, 409);
        };

        // Before anything is stored: a retry answers from the saved report,
        // and a full inbox or a missing status refuses up front.
        const repeat = await existing();
        if (repeat) return repeat;
        const totalSize = images.reduce((n, i) => n + i.bytes.byteLength, 0);
        const since = Date.now() - DAY;
        const notReady = () => json({ error: "This inbox isn't ready to receive reports." }, 503);
        const full = () => json({ error: "This inbox has received too many images today. Send it without images or try tomorrow." }, 429);
        const precheck = async () => {
          if (!(await statusOfKind(db, ws.id, "open"))) {
            console.error(`[private-feedback] ${ws.id} has no open status`);
            return notReady();
          }
          if (totalSize) {
            const [{ used }] = await db
              .select({ used: sql<number>`coalesce(sum(${privateFeedback.imagesSize}), 0)` })
              .from(privateFeedback)
              .where(and(eq(privateFeedback.workspaceId, ws.id), gt(privateFeedback.createdAt, new Date(since))));
            if (used + totalSize > DAILY_PRIVATE_BYTES) return full();
          }
          return null;
        };
        const refused = await precheck();
        if (refused) return refused;

        const bucket = uploadsBucket();
        if (images.length && !bucket) return json({ error: "Image uploads are not set up on this server." }, 503);
        const stored = images.map((i) => ({ id: `pf_${newId()}`, contentType: i.contentType, size: i.bytes.byteLength, width: i.width, height: i.height }));
        const written: string[] = [];
        const discard = async () => {
          if (!written.length || !bucket) return;
          await bucket.delete(written).catch((err: unknown) => console.error("[private-feedback] could not delete", written, err instanceof Error ? err.message : err));
        };

        const id = newId();
        const now = Date.now();
        let inserted: { id: string }[];
        try {
          for (const [i, img] of images.entries()) {
            const key = objectKey(ws.id, stored[i]!.id);
            await bucket!.put(key, img.bytes, { httpMetadata: { contentType: img.contentType } });
            written.push(key);
          }
          // One statement: the open status, the daily cap and the duplicate
          // check all hold at the moment of the insert, or nothing is saved.
          inserted = await db.all<{ id: string }>(sql`
            INSERT INTO private_feedback (id, workspace_id, submission_id, content_hash, type, title, message, reporter_name, reporter_email, metadata, images, images_size, status, created_at, updated_at, status_changed_at)
            SELECT ${id}, ${ws.id}, ${data.submissionId}, ${hash}, ${data.type}, ${data.title}, ${data.message}, ${data.name}, ${data.email}, ${metadata.value}, ${JSON.stringify(stored)}, ${totalSize}, s.key, ${now}, ${now}, ${now}
            FROM status s
            WHERE s.workspace_id = ${ws.id} AND s.kind = 'open'
              AND (SELECT coalesce(sum(images_size), 0) FROM private_feedback WHERE workspace_id = ${ws.id} AND created_at > ${since}) + ${totalSize} <= ${DAILY_PRIVATE_BYTES}
            ORDER BY s.position LIMIT 1
            ON CONFLICT (workspace_id, submission_id) DO NOTHING
            RETURNING id
          `);
        } catch (err) {
          console.error("[private-feedback] save failed:", err instanceof Error ? err.message : err);
          await discard();
          return sendFailed();
        }

        if (!inserted.length) {
          await discard();
          return (await existing()) ?? (await precheck()) ?? sendFailed();
        }

        await inBackground("private-feedback-email", () =>
          sendPrivateFeedbackEmail(db, { workspace: ws, origin: new URL(request.url).origin, report: { id, type: data.type, title: data.title } }),
        );
        return json(receipt, 201);
      },
    },
  },
});
