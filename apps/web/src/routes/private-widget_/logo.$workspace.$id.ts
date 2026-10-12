import { createFileRoute } from "@tanstack/react-router";

import { PRIVATE_LOGO_ID } from "@/lib/private-feedback";

const notFound = () => new Response("Not found", { status: 404, headers: { "content-type": "text/plain", "cache-control": "no-store" } });

// The private widget's current logo for a receiver. Only that one id
// resolves; ids are never reused, so it caches forever.
export const Route = createFileRoute("/private-widget_/logo/$workspace/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!PRIVATE_LOGO_ID.test(params.id)) return notFound();
        const [{ privateReceiver }, { createDb, privateWidget }, { objectKey, uploadsBucket }, { eq }] = await Promise.all([
          import("@/lib/private-receiver"),
          import("@openheard/db"),
          import("@/lib/attachment-db"),
          import("drizzle-orm"),
        ]);
        const ws = await privateReceiver(request, params.workspace);
        if (!ws) return notFound();
        const [row] = await createDb().select({ logoId: privateWidget.logoId }).from(privateWidget).where(eq(privateWidget.workspaceId, ws.id)).limit(1);
        if (row?.logoId !== params.id) return notFound();
        const object = await uploadsBucket()?.get(objectKey(ws.id, params.id));
        if (!object) return notFound();
        return new Response(object.body, {
          headers: {
            "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
            "content-length": String(object.size),
            "cache-control": "public, max-age=31536000, immutable",
            "x-content-type-options": "nosniff",
            "content-security-policy": "default-src 'none'; sandbox",
          },
        });
      },
    },
  },
});
