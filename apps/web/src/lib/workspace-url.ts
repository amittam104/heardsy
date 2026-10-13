const DEV = (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;

// Absolute URL for a workspace. In the cloud every workspace is a subdomain of
// ROOT_DOMAIN; on a self-hosted install there is only "default" at the origin.
// Local dev has no subdomains, so ?ws= picks the workspace instead.
export function workspaceUrl(slug: string, rootDomain: string | null, path = "/") {
  if (!rootDomain && DEV) return `${path}${path.includes("?") ? "&" : "?"}ws=${slug}`;
  if (!rootDomain || slug === "default") return path;
  if (typeof window !== "undefined") {
    const { protocol, port } = window.location;
    return `${protocol}//${slug}.${rootDomain}${port ? ":" + port : ""}${path}`;
  }
  const protocol = rootDomain === "localhost" ? "http:" : "https:";
  return `${protocol}//${slug}.${rootDomain}${path}`;
}

// A workspace still on the schema default name has not been set up yet.
const UNSET_NAME = "openheard";
export function workspaceLabel(name: string | null | undefined): string {
  return !name || name === UNSET_NAME ? "Heardsy" : name;
}

// Where a signed-in person lands on this workspace's origin: admins on the
// dashboard (or first-run setup while the workspace still has the schema
// default name), granted teammates on private feedback, everyone else on the board.
export function signedInHome(user: { role: string; privateAccess: boolean } | null, workspaceName: string, boardPath: string): string {
  if (user?.role === "admin") return workspaceName === UNSET_NAME ? "/welcome" : "/dashboard";
  if (user?.privateAccess) return "/dashboard/private";
  return boardPath;
}
