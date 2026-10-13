import { ArrowLeftIcon } from "@phosphor-icons/react";
import { Link, Outlet, createFileRoute, redirect, useLoaderData, useLocation } from "@tanstack/react-router";

import { Panel } from "@/components/admin/panel";
import { DashboardErrorState, DashboardPanelSkeleton } from "@/components/states";
import { SETTINGS_NAV, TEAMMATE_SETTINGS, teammateAllowed } from "@/lib/admin-nav";
import { DEMO_HIDDEN_SETTINGS, isDemo } from "@/lib/demo";
import { cn } from "@openheard/ui/lib/utils";

export const Route = createFileRoute("/dashboard/settings")({
  // Locked demo pages never mount, so their loaders never call a server
  // function that would throw.
  loader: async ({ parentMatchPromise, location }) => {
    const parent = await parentMatchPromise;
    if (!parent.loaderData?.admin && !teammateAllowed(location.pathname)) throw redirect({ to: "/dashboard/private" });
    if (!parent.loaderData?.demo) return;
    if (DEMO_HIDDEN_SETTINGS.some((slug) => location.pathname === `/dashboard/settings/${slug}`)) {
      throw redirect({ to: "/dashboard/settings/general" });
    }
  },
  component: SettingsLayout,
  errorComponent: ({ error }) => <DashboardErrorState message={(error as Error)?.message} retry="/dashboard/settings/general" />,
  pendingComponent: DashboardPanelSkeleton,
});

function SettingsLayout() {
  const { pathname } = useLocation();
  const root = useLoaderData({ from: "__root__" });
  // The demo hands admin to anyone, so the settings that spend money, show
  // member emails or outlive the nightly reset are not there at all.
  const locked = isDemo(root.workspace) ? (DEMO_HIDDEN_SETTINGS as readonly string[]) : [];
  const teammate = root.user?.role !== "admin";
  const shown = (slug: string) => !locked.includes(slug) && (!teammate || (TEAMMATE_SETTINGS as readonly string[]).includes(slug));
  const groups = SETTINGS_NAV.map((g) => ({ group: g.group, items: g.items.filter(([slug]) => shown(slug)) })).filter((g) => g.items.length > 0);
  const onLocked = locked.some((slug) => pathname === `/dashboard/settings/${slug}`);
  return (
    <Panel title="Settings" heading={false} className="flex flex-col md:flex-row">
      <nav data-settings-nav aria-label="Settings" className="flex shrink-0 flex-row gap-1 overflow-x-auto border-b px-3 py-2 md:w-[220px] md:flex-col md:overflow-x-hidden md:overflow-y-auto md:border-r md:border-b-0 md:pt-3 md:pb-4">
        <Link to={teammate ? "/dashboard/private" : "/dashboard"} className="hidden h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-sm font-semibold outline-none select-none hover:bg-accent/60 md:flex">
          <ArrowLeftIcon aria-hidden className="size-[13px] text-muted-foreground" /> Back to dashboard
        </Link>
        {groups.map((g) => (
          <div key={g.group} className="flex flex-row gap-0.5 md:flex-col md:pt-3.5">
            <div className="hidden px-2 pb-1.5 text-xs font-medium text-muted-foreground md:block">{g.group}</div>
            {g.items.map(([slug, label]) => {
              const to = `/dashboard/settings/${slug}`;
              const on = pathname === to;
              return (
                <Link key={slug} to={to} preload="viewport" aria-current={on ? "page" : undefined} className={cn("flex h-8 shrink-0 cursor-pointer items-center whitespace-nowrap rounded-md px-2 text-[13px] outline-none select-none", on ? "bg-secondary font-semibold text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")}>
                  {label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="min-w-0 flex-1 overflow-auto px-4 pt-5 pb-6 md:px-8 md:pt-7 md:pb-8">
        {/* The widget page keeps its live preview beside the form. */}
        <div className={pathname === "/dashboard/settings/widget" || pathname === "/dashboard/settings/private-widget" ? "max-w-[1400px]" : "max-w-[920px]"}>
          {onLocked ? (
            <p className="text-[13px] text-muted-foreground">This setting is not available in the demo workspace. Create your own workspace to change it.</p>
          ) : (
            <Outlet />
          )}
        </div>
      </div>
    </Panel>
  );
}

export function PageHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex flex-col gap-1 pb-7">
      <h1 className="text-xl font-semibold tracking-[-0.02em]">{title}</h1>
      <p className="text-[13px] text-muted-foreground">{sub}</p>
    </div>
  );
}
