import { ArrowLeftIcon } from "@phosphor-icons/react";
import { Link, createFileRoute, redirect, useLoaderData, useRouter } from "@tanstack/react-router";

import { AuthForm } from "@/components/auth-form";
import { WorkspaceLogo } from "@/components/logo";
import { myWorkspaces } from "@/functions/admin";
import { getWorkspace } from "@/functions/workspace";
import { getWorkspaceMemberCount } from "@/functions/invites";
import { signedInHome, workspaceLabel, workspaceUrl } from "@/lib/workspace-url";

type Search = { redirect?: string };

type Root = Awaited<ReturnType<typeof getWorkspace>>;

// The cloud apex sends you to your newest workspace's dashboard, or to make one.
async function cloudHome(root: Root) {
  const own = (await myWorkspaces()).filter((w) => w.id !== "default");
  const latest = own[own.length - 1];
  return latest ? workspaceUrl(latest.id, root.rootDomain, "/dashboard") : "/new";
}

async function home(root: Root) {
  if (root.marketing) return cloudHome(root);
  return root.localDashboard ?? signedInHome(root.user, root.workspace.name, root.boardPath);
}

export const Route = createFileRoute("/login")({
  // Same-site paths only, query string included (the widget's sign-in popup
  // carries its nonce through here), so it goes by href rather than route.
  validateSearch: (s: Record<string, unknown>): Search => ({
    redirect: typeof s.redirect === "string" && /^\/(?![/\\])/.test(s.redirect) ? s.redirect : undefined,
  }),
  beforeLoad: async ({ search }) => {
    const root = await getWorkspace();
    if (!root.user) return;
    if ((search as Search).redirect) throw redirect({ href: (search as Search).redirect! });
    // Another local workspace needs a full load so ?ws= reaches the server.
    throw redirect({ href: await home(root), reloadDocument: !!root.localDashboard });
  },
  loader: () => getWorkspaceMemberCount(),
  head: () => ({ meta: [{ title: "Sign in · feedback" }] }),
  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const root = useLoaderData({ from: "__root__" });
  const search = Route.useSearch();
  const memberCount = Route.useLoaderData();

  const wsName = workspaceLabel(root.workspace?.name);
  // Google and email links come back here, and the guard above sends them on.
  const callbackURL = search.redirect ?? "/login";

  async function afterAuth() {
    await router.invalidate();
    if (search.redirect) {
      router.navigate({ href: search.redirect });
      return;
    }
    const fresh = await getWorkspace();
    const url = await home(fresh).catch(() => "/new");
    const dest = new URL(url, window.location.origin);
    if (dest.origin === window.location.origin && !fresh.localDashboard) router.navigate({ href: dest.pathname + dest.search });
    else window.location.href = url;
  }

  return (
    <main className="flex flex-1 flex-col px-5 py-6">
      <Link to="/" className="inline-flex min-h-10 items-center gap-2 self-start rounded-md px-2 text-[13px] text-muted-foreground outline-none hover:text-foreground">
        <ArrowLeftIcon aria-hidden className="size-3.5" /> Home
      </Link>
      <div className="flex flex-1 items-center justify-center py-10">
        <div className="flex w-full max-w-[380px] flex-col items-center gap-6">
          <WorkspaceLogo size={32} />
          <AuthForm
            wsName={wsName}
            hasGoogle={root.googleSignIn}
            callbackURL={callbackURL}
            onSuccess={afterAuth}
            intro={root.marketing ? "Sign in to open your workspace dashboard." : "Your team account opens the dashboard. Any other account votes and comments on the board."}
            showFirstAccountHint={!root.rootDomain && memberCount === 0}
          />
        </div>
      </div>
    </main>
  );
}
