import type { Icon } from "@phosphor-icons/react";
import {
  ArrowSquareOutIcon,
  CaretDownIcon,
  CaretRightIcon,
  CheckCircleIcon,
  CircleDashedIcon,
  CircleHalfIcon,
  CircleIcon,
  GearSixIcon,
  LifebuoyIcon,
  LockSimpleIcon,
  MapTrifoldIcon,
  MegaphoneIcon,
  PlusIcon,
  SidebarSimpleIcon,
  SignOutIcon,
  SpinnerGapIcon,
  SquaresFourIcon,
  TagIcon,
  TrayIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { Link, useLoaderData, useLocation, useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { Avatar } from "@/components/bits";
import Logo from "@/components/logo";
import { authClient } from "@/lib/auth-client";
import { myWorkspaces } from "@/functions/admin";
import { isDemo } from "@/lib/demo";
import { workspaceUrl } from "@/lib/workspace-url";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@openheard/ui/components/dropdown-menu";
import { Collapsible } from "@/components/collapsible";
import { KIND_ICON, useStatuses } from "@/lib/status";
import { cn } from "@openheard/ui/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@openheard/ui/components/tooltip";

const GLYPH: Record<(typeof KIND_ICON)[keyof typeof KIND_ICON], Icon> = {
  "circle-dashed": CircleDashedIcon,
  circle: CircleIcon,
  "circle-half": CircleHalfIcon,
  "spinner-gap": SpinnerGapIcon,
  "check-circle": CheckCircleIcon,
  "x-circle": XCircleIcon,
};

// Workspace name with a menu to hop to any other workspace you belong to.
function WorkspaceSwitcher() {
  const root = useLoaderData({ from: "__root__" });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={`Workspace: ${root.workspace.name}. Switch workspace`} className="group/ws flex h-8 min-w-0 items-center gap-2 rounded-md pr-1.5 pl-1 text-sm font-semibold outline-none hover:bg-accent/60">
        <Logo size={18} />
        <span className="truncate text-[15px]">{root.workspace.name}</span>
        <CaretDownIcon aria-hidden className="size-2.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-52">
        <WorkspaceItems />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Rows of the workspace menu: every workspace you belong to, then "New workspace".
function WorkspaceItems() {
  const root = useLoaderData({ from: "__root__" });
  const [list, setList] = useState<{ id: string; name: string; role: string }[] | null>(null);
  useEffect(() => {
    myWorkspaces().then(setList);
  }, []);
  return (
    <>
      {(list ?? [{ id: root.workspace.id, name: root.workspace.name, role: "admin" }]).map((w) => (
        <DropdownMenuItem key={w.id} disabled={w.id === root.workspace.id} onClick={() => (window.location.href = workspaceUrl(w.id, root.rootDomain, "/dashboard"))}>
          <span className="flex-1 truncate">{w.name}</span>
          <span className="text-xs text-faint capitalize">{w.role}</span>
        </DropdownMenuItem>
      ))}
      {root.rootDomain && !isDemo(root.workspace) ? (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link to="/new" />}>
            <PlusIcon className="size-3.5" /> New workspace
          </DropdownMenuItem>
        </>
      ) : null}
    </>
  );
}

// 220px filter column shown next to the rail on the Posts page.
export function FilterColumn() {
  const root = useLoaderData({ from: "__root__" });
  const { pathname, search } = useLocation();
  const statuses = useStatuses();
  const status = (search as { status?: string }).status ?? "";
  const inInbox = pathname.startsWith("/dashboard/inbox");
  const plain = inInbox && !status && !(search as { board?: string }).board && !(search as { tag?: string }).tag;
  return (
    <aside className="hidden h-full w-[220px] shrink-0 flex-col overflow-y-auto border-r px-3 pt-[15px] pb-4 [scrollbar-width:none] md:flex">
      <div className="flex h-7 items-center pl-2">
        <span className="text-[15px] font-semibold">Posts</span>
      </div>
      <div className="flex flex-col gap-1 pt-3">
        <Item to="/dashboard/inbox" active={plain} icon={TrayIcon} label="All posts" count={root.total} />
      </div>
      <Group label="Status">
        {statuses.map((s) => {
          const G = GLYPH[KIND_ICON[s.kind]];
          const filled = s.kind === "done" || s.kind === "closed";
          return <Item key={s.key} to="/dashboard/inbox" search={{ status: s.key }} active={inInbox && status === s.key} icon={G} iconColor={s.color} weight={filled ? "fill" : "regular"} label={s.label} count={root.statusCounts[s.key] ?? 0} />;
        })}
      </Group>
      <Group label="Quick filters">
        <Expand icon={SquaresFourIcon} label="Boards">
          {root.boards.map((b) => (
            <Item key={b.id} to="/dashboard/inbox" search={{ status, board: b.id }} active={inInbox && (search as { board?: string }).board === b.id} label={b.name} count={b.count} sub />
          ))}
        </Expand>
        <Expand icon={TagIcon} label="Tags">
          {root.tags.length === 0 ? <div className="px-2 py-1 pl-[38px] text-xs text-faint">No tags yet</div> : null}
          {root.tags.map((t) => (
            <Item key={t.id} to="/dashboard/inbox" search={{ status, tag: t.id }} active={inInbox && (search as { tag?: string }).tag === t.id} label={t.name} sub />
          ))}
        </Expand>
      </Group>
    </aside>
  );
}

// Expanded nav: workspace switcher, pages, account. Same destinations as the rail.
export function AdminSidebar({ onNewPost, onCollapse, collapseLabel = "Collapse sidebar" }: { onNewPost?: () => void; onCollapse?: () => void; collapseLabel?: string }) {
  const root = useLoaderData({ from: "__root__" });
  const { pathname, search } = useLocation();
  const inInbox = pathname.startsWith("/dashboard/inbox");
  const admin = root.user?.role === "admin";

  return (
    <nav aria-label="Dashboard" className="flex h-full min-h-0 w-full flex-col px-3 pt-3.5 pb-4 md:w-[200px]">
      <div className="flex shrink-0 items-center justify-between gap-1 px-1">
        <WorkspaceSwitcher />
        <button type="button" onClick={onCollapse} aria-label={collapseLabel} title={collapseLabel} className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground">
          <SidebarSimpleIcon aria-hidden className="size-4" />
        </button>
      </div>

      {/* Pages scroll on short windows so the account footer stays on screen. */}
      <div className="-mx-3 min-h-0 flex-1 overflow-y-auto px-3 pb-3 [scrollbar-width:none]">
      <Group>
        {admin ? (
          <>
            <Item to="/dashboard/inbox" active={inInbox && !(search as { status?: string }).status} icon={TrayIcon} label="Posts" count={root.total} />
            <Item to="/dashboard/roadmap" icon={MapTrifoldIcon} label="Roadmap" />
            <Item to="/dashboard/changelog" icon={MegaphoneIcon} label="Changelog" />
            <Item to="/dashboard/help" icon={LifebuoyIcon} label="Help center" />
          </>
        ) : null}
        <Item to="/dashboard/private" icon={LockSimpleIcon} label="Private feedback" />
        {admin ? <Item icon={PlusIcon} label="New post" onClick={onNewPost} /> : null}
      </Group>
      </div>

      <AccountMenu>
        <Item to={root.boardPath} icon={ArrowSquareOutIcon} label="Public board" />
        <Item to={admin ? "/dashboard/settings/general" : "/dashboard/settings/private-widget"} active={pathname.startsWith("/dashboard/settings")} icon={GearSixIcon} label="Settings" />
      </AccountMenu>
    </nav>
  );
}

function AccountMenu({ children }: { children: ReactNode }) {
  const root = useLoaderData({ from: "__root__" });
  const router = useRouter();
  return (
    <div className="flex shrink-0 flex-col gap-0.5 border-t pt-3">
      {children}
      <DropdownMenu>
        <DropdownMenuTrigger aria-label={`Account: ${root.user?.name ?? ""}`} className="flex h-10 w-full items-center gap-2 rounded-md px-2 outline-none hover:bg-accent/60">
          <Avatar name={root.user?.name ?? "?"} image={root.user?.image} size={22} />
          <span className="flex min-w-0 flex-1 flex-col text-left">
            <span className="truncate text-[13px] font-medium">{root.user?.name}</span>
            <span className="truncate text-xs text-muted-foreground">{root.user?.email}</span>
          </span>
          <CaretDownIcon aria-hidden className="size-3 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="min-w-48">
          <DropdownMenuItem
            onClick={() =>
              authClient.signOut({
                fetchOptions: {
                  onSuccess: () => router.invalidate().then(() => router.navigate({ to: "/login" })),
                },
              })
            }
          >
            <SignOutIcon className="size-4" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function Group({ label, children }: { label?: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="flex flex-col gap-1 pt-4">
      {label ? (
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="group/g flex items-center justify-between rounded-md px-2 pb-1 text-[13px] text-muted-foreground outline-none hover:text-foreground">
          {label}
          <CaretDownIcon aria-hidden className={cn("size-2.5 transition-transform motion-reduce:transition-none", !open && "-rotate-90")} />
        </button>
      ) : null}
      <Collapsible open={open}>
        <div className="flex flex-col gap-1">{children}</div>
      </Collapsible>
    </div>
  );
}

// A row that opens into a nested list (boards, tags), indented 14px like the size guide.
function Expand({ icon: I, label, children }: { icon: Icon; label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] font-medium text-muted-foreground outline-none hover:bg-accent/60 hover:text-foreground">
        <I aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        <CaretRightIcon aria-hidden className={cn("size-[11px] text-muted-foreground transition-transform motion-reduce:transition-none", open && "rotate-90")} />
      </button>
      <Collapsible open={open}>
        <div className="flex flex-col gap-1">{children}</div>
      </Collapsible>
    </div>
  );
}

function Item({
  to,
  search,
  exact,
  active,
  icon: I,
  iconClassName,
  iconColor,
  weight,
  label,
  count,
  trailing,
  onClick,
  sub,
}: {
  to?: string;
  search?: Record<string, string>;
  exact?: boolean;
  active?: boolean;
  icon?: Icon;
  iconClassName?: string;
  iconColor?: string;
  weight?: "fill" | "regular";
  label: string;
  count?: number;
  trailing?: ReactNode;
  onClick?: () => void;
  sub?: boolean;
}) {
  const { pathname } = useLocation();
  const on = active ?? (to ? (exact ? pathname === to : pathname.startsWith(to) && to !== "/") : false);
  const cls = cn("flex h-8 w-full cursor-pointer items-center gap-2.5 rounded-md px-2 text-[13px] font-medium outline-none select-none", sub && "h-[30px] pl-[38px]", on ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground");
  const icon = I ? <I aria-hidden weight={weight} style={iconColor ? { color: iconColor } : undefined} className={cn("size-4 shrink-0", !iconColor && (iconClassName ?? (on ? "text-foreground" : "text-muted-foreground")))} /> : null;
  const inner = (
    <>
      {icon}
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {count !== undefined ? <span className="text-[13px] text-muted-foreground tabular-nums">{count}</span> : trailing}
    </>
  );
  if (to) {
    return (
      <Link to={to} search={search} preload="viewport" aria-current={on ? "page" : undefined} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

// 56px rail: same destinations as the full sidebar, icons only, titles on hover.
export function AdminRail({ onExpand, onNewPost }: { onExpand?: () => void; onNewPost?: () => void }) {
  const { pathname } = useLocation();
  const root = useLoaderData({ from: "__root__" });
  const router = useRouter();
  const inInbox = pathname.startsWith("/dashboard/inbox");
  const admin = root.user?.role === "admin";
  const cls = (on: boolean) => cn("inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg outline-none select-none", on ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground");
  return (
    <TooltipProvider delay={300}>
    <aside className="flex h-full min-h-0 w-14 flex-col items-center py-3.5">
      <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-1 overflow-y-auto [scrollbar-width:none]">
      <DropdownMenu>
        <Tip label={root.workspace.name}>
          <DropdownMenuTrigger aria-label={`Workspace: ${root.workspace.name}. Switch workspace`} className="mb-2.5 inline-flex size-9 shrink-0 items-center justify-center rounded-lg outline-none hover:bg-accent/60">
            <Logo size={20} />
          </DropdownMenuTrigger>
        </Tip>
        <DropdownMenuContent align="start" side="right" className="min-w-52">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Workspaces</DropdownMenuLabel>
            <WorkspaceItems />
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {admin ? (
        <>
          <Tip label="Posts">
            <Link to="/dashboard/inbox" preload="viewport" aria-label="Posts" className={cls(inInbox)}>
              <TrayIcon className="size-[17px]" />
            </Link>
          </Tip>
          <Tip label="Roadmap">
            <Link to="/dashboard/roadmap" preload="viewport" aria-label="Roadmap" className={cls(pathname.startsWith("/dashboard/roadmap"))}>
              <MapTrifoldIcon className="size-[17px]" />
            </Link>
          </Tip>
          <Tip label="Changelog">
            <Link to="/dashboard/changelog" preload="viewport" aria-label="Changelog" className={cls(pathname.startsWith("/dashboard/changelog"))}>
              <MegaphoneIcon className="size-[17px]" />
            </Link>
          </Tip>
          <Tip label="Help center">
            <Link to="/dashboard/help" preload="viewport" aria-label="Help center" className={cls(pathname.startsWith("/dashboard/help"))}>
              <LifebuoyIcon className="size-[17px]" />
            </Link>
          </Tip>
        </>
      ) : null}
      <Tip label="Private feedback">
        <Link to="/dashboard/private" preload="viewport" aria-label="Private feedback" className={cls(pathname.startsWith("/dashboard/private"))}>
          <LockSimpleIcon className="size-[17px]" />
        </Link>
      </Tip>
      {admin ? (
        <Tip label="New post">
          <button type="button" aria-label="New post" onClick={onNewPost} className={cls(false)}>
            <PlusIcon className="size-[17px]" />
          </button>
        </Tip>
      ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-center gap-1 pt-1">
      {onExpand ? (
        <Tip label="Expand sidebar">
          <button type="button" aria-label="Expand sidebar" onClick={onExpand} className={cls(false)}>
            <SidebarSimpleIcon className="size-[17px]" />
          </button>
        </Tip>
      ) : null}
      <Tip label="Public board">
        <Link to={root.boardPath} preload="viewport" aria-label="Public board" className={cls(false)}>
          <ArrowSquareOutIcon className="size-[17px]" />
        </Link>
      </Tip>
      <Tip label="Settings">
        <Link to={admin ? "/dashboard/settings/general" : "/dashboard/settings/private-widget"} preload="viewport" aria-label="Settings" className={cls(pathname.startsWith("/dashboard/settings"))}>
          <GearSixIcon className="size-[17px]" />
        </Link>
      </Tip>
      <DropdownMenu>
        <DropdownMenuTrigger aria-label={`Account: ${root.user?.name ?? ""}`} title={root.user?.name} className="mt-1.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full outline-none">
          <Avatar name={root.user?.name ?? "?"} image={root.user?.image} size={28} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="right" className="min-w-40">
          <DropdownMenuItem
            onClick={() =>
              authClient.signOut({
                fetchOptions: {
                  onSuccess: () => router.invalidate().then(() => router.navigate({ to: "/login" })),
                },
              })
            }
          >
            <SignOutIcon className="size-4" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      </div>
    </aside>
    </TooltipProvider>
  );
}

function Tip({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side="right" sideOffset={8}>{label}</TooltipContent>
    </Tooltip>
  );
}
