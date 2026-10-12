import { createFileRoute } from "@tanstack/react-router";

import { PRIVATE_IMAGE_ID } from "@/lib/private-feedback";

const notFound = () => new Response("Not found", { status: 404, headers: { "content-type": "text/plain", "cache-control": "private, no-store" } });

// A screenshot on a private report, for whoever may read that report right
// now. Access is checked on every request and nothing is cached, so revoking
// a teammate cuts off links they already had.
export const Route = createFileRoute("/api/private-feedback_/$id/images/$imageId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!PRIVATE_IMAGE_ID.test(params.imageId)) return notFound();
        const [{ getSessionContext }, { createDb, privateFeedback }, { objectKey, uploadsBucket }, { and, eq }] = await Promise.all([
          import("@/lib/session"),
          import("@openheard/db"),
          import("@/lib/attachment-db"),
          import("drizzle-orm"),
        ]);
        const ctx = await getSessionContext(request).catch(() => null);
        if (!ctx?.user?.privateAccess) return notFound();
        const [row] = await createDb()
          .select({ images: privateFeedback.images })
          .from(privateFeedback)
          .where(and(eq(privateFeedback.id, params.id), eq(privateFeedback.workspaceId, ctx.workspace.id)))
          .limit(1);
        const image = row?.images.find((i) => i.id === params.imageId);
        if (!image) return notFound();
        const object = await uploadsBucket()?.get(objectKey(ctx.workspace.id, image.id));
        if (!object) return notFound();
        return new Response(object.body, {
          headers: {
            "content-type": image.contentType,
            "content-length": String(object.size),
            "cache-control": "private, no-store",
            "x-content-type-options": "nosniff",
            "content-security-policy": "default-src 'none'; sandbox",
            "cross-origin-resource-policy": "same-origin",
            "content-disposition": "inline",
          },
        });
      },
    },
  },
});
