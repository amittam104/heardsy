// Server only: server.ts and tests. Kept out of widget-origins.ts because the
// settings page imports that one, and this pulls in the session resolver.
import { MAX_EMBED_ORIGINS, frameAncestors, parseEmbedOrigins } from "./widget-origins";

// The directive for a request to /widget, from its workspace's list.
export async function frameAncestorsFor(request: Request): Promise<string> {
  try {
    const { workspaceFromRequest } = await import("./session");
    return frameAncestors((await workspaceFromRequest(request))?.widgetOrigins);
  } catch {
    // Without the workspace's list we cannot tell who may frame it.
    return "frame-ancestors 'self'";
  }
}

// The directive for /private-widget: its receiver's own list, and the
// dashboard preview on this origin. None saved means no other site.
export async function privateFrameAncestorsFor(request: Request): Promise<string> {
  try {
    const [{ privateReceiver }, { createDb, privateWidget }, { eq }] = await Promise.all([import("./private-receiver"), import("@openheard/db"), import("drizzle-orm")]);
    const ws = await privateReceiver(request);
    if (!ws) return "frame-ancestors 'self'";
    const [row] = await createDb().select({ origins: privateWidget.origins }).from(privateWidget).where(eq(privateWidget.workspaceId, ws.id)).limit(1);
    const { origins } = parseEmbedOrigins(row?.origins ?? "");
    return origins.length ? `frame-ancestors 'self' ${origins.slice(0, MAX_EMBED_ORIGINS).join(" ")}` : "frame-ancestors 'self'";
  } catch {
    return "frame-ancestors 'self'";
  }
}
