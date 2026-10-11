import { createFileRoute } from "@tanstack/react-router";

import { MAX_IMAGE_BYTES } from "@/lib/attachments";
import { isDemo } from "@/lib/demo";

const json = (body: unknown, status = 200, headers?: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

// Stores a logo for the private widget and hands back its `pl_` id, the only
// kind of id savePrivateWidgetSettings accepts. Nothing changes until that
// save; a logo that is never saved is swept a day later.
export const Route = createFileRoute("/api/private-widget/logo")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const origin = request.headers.get("origin");
        if (origin && origin !== new URL(request.url).origin) return json({ error: "Cross-origin uploads are not allowed" }, 403);

        const { getSessionContext } = await import("@/lib/session");
        const { user, workspace } = await getSessionContext(request);
        if (!user?.privateAccess) return json({ error: "No access" }, 403);
        if (isDemo(workspace)) return json({ error: "Not available in the demo workspace" }, 403);

        const { uploadAllowed } = await import("@/lib/rate-limit");
        if (!(await uploadAllowed(user.id, request.headers.get("cf-connecting-ip")))) return json({ error: "Too many uploads. Try again in a minute." }, 429, { "retry-after": "60" });

        if (Number(request.headers.get("content-length") ?? "") > MAX_IMAGE_BYTES) return json({ error: "Logos can be up to 5 MB." }, 413);
        const [{ newId, objectKey, readCapped, uploadsBucket }, { sniffImageType }] = await Promise.all([import("@/lib/attachment-db"), import("@/lib/attachments")]);
        const bytes = await readCapped(request, MAX_IMAGE_BYTES);
        if (!bytes) return json({ error: "Logos can be up to 5 MB." }, 413);
        if (!bytes.byteLength) return json({ error: "That file is empty." }, 400);
        const type = sniffImageType(bytes);
        if (!type) return json({ error: "That file is not a PNG, JPEG, GIF or WebP image." }, 415);
        const bucket = uploadsBucket();
        if (!bucket) return json({ error: "Image uploads are not set up on this server" }, 503);
        const id = `pl_${newId()}`;
        await bucket.put(objectKey(workspace.id, id), bytes, { httpMetadata: { contentType: type } });
        return json({ logoId: id }, 201);
      },
    },
  },
});
