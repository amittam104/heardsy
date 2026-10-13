import { Outlet, createFileRoute, redirect, useLoaderData, useLocation, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { OpenNav } from "@/components/admin/panel";
import { AdminRail, AdminSidebar } from "@/components/admin/sidebar";
import { NewPostDialog } from "@/components/new-post-dialog";
import { DashboardErrorState, DashboardShellSkeleton } from "@/components/states";
import { DemoBanner } from "@/components/demo-banner";
import { SkipLink } from "@/components/bits";
import { Dialog, DialogContent, DialogTitle } from "@openheard/ui/components/dialog";
import { teammateAllowed } from "@/lib/admin-nav";
import { isDemo } from "@/lib/demo";

export const Route = createFileRoute("/dashboard")({
  loader: async ({ parentMatchPromise, location }) => {
    const parent = await parentMatchPromise;
    const user = parent.loaderData?.user;
    if (!user) throw redirect({ to: "/login", search: { redirect: location.href } });
    // Signed in without dashboard access: back to the board, not round the sign-in page again.
    if (user.role !== "admin" && !user.privateAccess) {
      const local = parent.loaderData?.localDashboard;
      throw redirect({ href: local ?? parent.loaderData?.boardPath ?? "/", reloadDocument: !!local });
    }
    // Granted teammates handle private feedback only; the server refuses the rest anyway.
    if (user.role !== "admin" && !teammateAllowed(location.pathname)) throw redirect({ to: "/dashboard/private" });
    return { demo: isDemo(parent.loaderData?.workspace), admin: user.role === "admin" };
  },
  component: AdminLayout,
  pendingComponent: DashboardShellSkeleton,
  errorComponent: ({ error }) => <DashboardErrorState message={(error as Error)?.message} />,
});

// Full sidebar everywhere except settings, where it collapses to the rail so
// the settings nav is the only full-width sidebar on screen.
function AdminLayout() {
  const root = useLoaderData({ from: "__root__" });
  const router = useRouter();
  const admin = root.user?.role === "admin";
  useEffect(() => {
    if (!admin) return;
    const siblings = [
      { to: "/dashboard/inbox" },
      { to: "/dashboard/roadmap" },
      { to: "/dashboard/changelog" },
      { to: "/dashboard/help" },
      { to: "/dashboard/settings/general" },
    ];
    for (const s of siblings) router.preloadRoute(s as unknown as Parameters<typeof router.preloadRoute>[0]);
  }, [router, admin]);
  const [composing, setComposing] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navTrigger = useRef<HTMLElement | null>(null);
  const openNav = useCallback((trigger: HTMLElement) => {
    navTrigger.current = trigger;
    setMobileOpen(true);
  }, []);
  const openCompose = useCallback(() => setComposing(true), []);
  useEffect(() => {
    window.addEventListener("oh:compose", openCompose);
    return () => window.removeEventListener("oh:compose", openCompose);
  }, [openCompose]);
  const { pathname } = useLocation();
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);
  const [navOpen, setNavOpen] = useState(false);
  useEffect(() => {
    setNavOpen(localStorage.getItem("oh:sidebar") === "full");
  }, []);
  const toggleNav = () =>
    setNavOpen((o) => {
      localStorage.setItem("oh:sidebar", o ? "rail" : "full");
      return !o;
    });
  return (
    <div className="flex h-dvh overflow-hidden bg-sidebar text-foreground">
      <SkipLink />
      {/* Desktop: icon rail always, filter column on Posts when open */}
      <aside className="hidden h-full shrink-0 md:flex" data-admin-sidebar>
        {navOpen ? <AdminSidebar onNewPost={() => setComposing(true)} onCollapse={toggleNav} /> : <AdminRail onExpand={toggleNav} onNewPost={() => setComposing(true)} />}
      </aside>
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent
          showClose={false}
          finalFocus={navTrigger}
          className="top-0 bottom-0 left-0 w-[min(16rem,85vw)] max-w-none translate-x-0 translate-y-0 gap-0 rounded-none border-0 border-r bg-sidebar p-0 data-open:slide-in-from-left md:hidden"
        >
          <DialogTitle className="sr-only">Navigation</DialogTitle>
          <AdminSidebar onNewPost={() => { setComposing(true); setMobileOpen(false); }} onCollapse={() => setMobileOpen(false)} collapseLabel="Close navigation" />
        </DialogContent>
      </Dialog>
      <main id="main" tabIndex={-1} className="flex min-w-0 flex-1 flex-col">
        {isDemo(root.workspace) ? <DemoBanner /> : null}
        <OpenNav.Provider value={openNav}>
          <Outlet />
        </OpenNav.Provider>
      </main>
      {admin ? <NewPostDialog open={composing} onOpenChange={setComposing} boards={root.boards} signedIn={!!root.user} /> : null}
    </div>
  );
}
