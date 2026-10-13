import { createFileRoute, Link, redirect, useLoaderData, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@openheard/ui/components/button";
import { WorkspaceLogo } from "@/components/logo";
import { getUser } from "@/functions/get-user";
import { acceptInvite } from "@/functions/invites";
import { getWorkspace } from "@/functions/workspace";
import { signedInHome } from "@/lib/workspace-url";

export const Route = createFileRoute("/join/$token")({
  head: () => ({ meta: [{ title: "Accept invite · feedback" }] }),
  beforeLoad: async ({ params }) => {
    const user = await getUser();
    if (!user) throw redirect({ to: "/login", search: { redirect: `/join/${params.token}` } });
  },
  component: JoinPage,
});

function JoinPage() {
  const { token } = Route.useParams();
  const router = useRouter();
  const board = useLoaderData({ from: "__root__" }).boardPath;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function accept() {
    setBusy(true);
    try {
      await acceptInvite({ data: { token } });
      setDone(true);
      toast.success("You joined the workspace");
      const fresh = await getWorkspace();
      await router.invalidate();
      setTimeout(() => {
        router.navigate({ href: signedInHome(fresh.user, fresh.workspace.name, fresh.boardPath) });
      }, 1500);
    } catch (e: any) {
      setError(e.message ?? "Failed to accept invite");
    }
    setBusy(false);
  }

  return (
    <main className="flex flex-1 items-center justify-center px-5 py-16">
      <div className="flex w-full max-w-[380px] flex-col items-center gap-6">
        <WorkspaceLogo size={32} />
        {done ? (
          <div className="flex flex-col items-center gap-2 text-center">
            <h1 className="text-[22px] font-semibold tracking-[-0.02em]">You’re in</h1>
            <p role="status" className="text-sm text-muted-foreground">Taking you to the workspace…</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-2 text-center">
            <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Invite problem</h1>
            <p className="text-sm text-muted-foreground">{error} Ask a workspace admin to send you a new invite link.</p>
            <Link to={board} className="mt-2 text-sm text-link hover:underline">
              Go to the board
            </Link>
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center gap-1.5 text-center">
              <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Accept invite</h1>
              <p className="text-sm text-muted-foreground">You've been invited to join this workspace.</p>
            </div>
            <Button full arrow size="lg" disabled={busy} onClick={accept}>
              {busy ? "Joining…" : "Accept invite"}
            </Button>
          </>
        )}
      </div>
    </main>
  );
}
