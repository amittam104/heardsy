// The receiving workspace for private widget requests. Server only. Every
// private loader, config, frame, collector and logo request names its
// receiver explicitly; an absent, unknown or mismatched one is refused and
// never falls back to the default workspace.
import { eq } from "drizzle-orm";

import { receiverDecision } from "./private-feedback";
import { type Workspace, isMarketingHost, localDev, rootDomain, workspaceSlugFromHost } from "./session";

export async function privateReceiver(request: Request, param = new URL(request.url).searchParams.get("workspace")): Promise<Workspace | null> {
  const host = request.headers.get("host") ?? "";
  const root = await rootDomain();
  const decision = receiverDecision({ param, hostSlug: workspaceSlugFromHost(host, root), marketing: isMarketingHost(host, root), local: await localDev() });
  if (decision !== "ok" || !param) return null;
  const { createDb, workspace } = await import("@openheard/db");
  const [ws] = await createDb().select().from(workspace).where(eq(workspace.id, param)).limit(1);
  return ws ?? null;
}
