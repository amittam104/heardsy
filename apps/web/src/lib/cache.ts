const PUBLIC_PATHS = ["/", "/roadmap", "/changelog", "/widget.json", "/private-widget.json"];
const PUBLIC_PATH_PREFIXES = ["/p/"];
const PRIVATE_PATHS = ["/dashboard", "/login", "/api", "/new", "/welcome", "/settings", "/demo"];

export function isPublicCacheable(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return PUBLIC_PATH_PREFIXES.some((p) => pathname.startsWith(p));
}

// The widget's metadata is fetched on every host page view, from any origin,
// with whatever query string the caller likes. Only `ws` (local dev) changes
// the answer, so everything else is dropped from its cache key.
export function edgeCacheKey(url: URL): string {
  if (url.pathname === "/private-widget.json") return privateConfigKey(url.origin, url.searchParams.get("workspace") ?? "");
  if (url.pathname !== "/widget.json") return url.toString();
  const ws = url.searchParams.get("ws");
  return url.origin + url.pathname + (ws ? `?ws=${encodeURIComponent(ws)}` : "");
}

export function isPrivatePath(pathname: string): boolean {
  return PRIVATE_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

// Uploaded images and logos set their own long-lived cache headers; a session
// cookie on the request does not make an image private.
export function isImmutableAsset(pathname: string): boolean {
  return pathname.startsWith("/uploads/") || pathname.startsWith("/logo/") || pathname.startsWith("/private-widget/logo/");
}

// The private widget's config is cached per receiving workspace, whatever
// else the query string says.
const privateConfigKey = (origin: string, workspaceId: string) => `${origin}/private-widget.json?workspace=${encodeURIComponent(workspaceId)}`;

export function hasSessionCookie(request: Request): boolean {
  const cookie = request.headers.get("cookie") ?? "";
  // The demo uses its own cookie namespace; both mean "do not cache this".
  return cookie.includes("better-auth.session_token") || cookie.includes("openheard-demo.session_token");
}

function getCache(): Cache | null {
  try {
    return (caches as unknown as { default: Cache }).default;
  } catch {
    return null;
  }
}

export async function purgeWorkspaceCache(origin: string, postIds?: number[]): Promise<void> {
  const cache = getCache();
  if (!cache) return;
  const paths = [...PUBLIC_PATHS, "/changelog.rss"];
  if (postIds) {
    for (const id of postIds) paths.push(`/p/${id}`);
  }
  await Promise.all(paths.map((p) => cache.delete(new Request(origin + p))));
}

export async function purgePrivateWidgetConfig(origin: string, workspaceId: string): Promise<void> {
  await getCache()?.delete(new Request(privateConfigKey(origin, workspaceId)));
}
