import { Button } from "@openheard/ui/components/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@openheard/ui/components/dropdown-menu";
import { cn } from "@openheard/ui/lib/utils";
import { CaretDownIcon, FunnelSimpleIcon, ImageIcon, LockSimpleIcon, XIcon } from "@phosphor-icons/react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Panel } from "@/components/admin/panel";
import { Avatar } from "@/components/bits";
import { DashboardErrorState, DashboardPanelSkeleton } from "@/components/states";
import { listPrivateAssignees, listPrivateFeedback } from "@/functions/private-feedback";
import { PRIVATE_TYPE_LABEL, type PrivateType } from "@/lib/private-feedback";
import { findStatus, useStatuses } from "@/lib/status";
import { ago, fullDate } from "@/lib/time";

type Search = { status?: string; type?: PrivateType; assignee?: string };

export const Route = createFileRoute("/dashboard/private/")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    status: typeof s.status === "string" ? s.status : undefined,
    type: s.type === "bug" || s.type === "feature" ? s.type : undefined,
    assignee: typeof s.assignee === "string" ? s.assignee : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const [page, people] = await Promise.all([listPrivateFeedback({ data: deps }), listPrivateAssignees()]);
    return { page, people };
  },
  head: () => ({ meta: [{ title: "Private feedback · Heardsy" }] }),
  component: PrivateInbox,
  errorComponent: ({ error }) => <DashboardErrorState message={(error as Error)?.message} retry="/dashboard/private" />,
  pendingComponent: DashboardPanelSkeleton,
});

type Row = Awaited<ReturnType<typeof listPrivateFeedback>>["items"][number];

function PrivateInbox() {
  const { page, people } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/dashboard/private/" });
  const statuses = useStatuses();
  const [rows, setRows] = useState<Row[]>(page.items);
  const [next, setNext] = useState(page.next);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const request = useRef(0);
  useEffect(() => {
    request.current++;
    setRows(page.items);
    setNext(page.next);
    setLoading(false);
  }, [page]);
  useEffect(() => () => void request.current++, []);

  async function more() {
    if (!next) return;
    const id = ++request.current;
    setLoading(true);
    try {
      const res = await listPrivateFeedback({ data: { ...search, cursor: next } });
      if (id !== request.current) return;
      setRows((r) => [...r, ...res.items]);
      setNext(res.next);
    } catch (err) {
      if (id === request.current) toast.error(err instanceof Error ? err.message : "Unable to load more reports. Check your connection and try again.");
    } finally {
      if (id === request.current) setLoading(false);
    }
  }

  const needle = q.trim().toLowerCase();
  const shown = needle ? rows.filter((r) => r.title.toLowerCase().includes(needle) || r.reporterName.toLowerCase().includes(needle)) : rows;
  const filtered = !!(search.status || search.type || search.assignee);
  const set = (patch: Partial<Search>) => navigate({ search: (p) => ({ ...p, ...patch }) });
  const status = search.status ? findStatus(statuses, search.status) : null;
  const assigneeLabel = search.assignee === "me" ? "Assigned to me" : search.assignee === "none" ? "Unassigned" : people.find((p) => p.id === search.assignee)?.name;

  return (
    <Panel title="Private feedback" onSearch={setQ} query={q} searchLabel="Search reports">
      <div className="flex flex-wrap items-center gap-1.5 px-3 pt-3 pb-2.5 md:px-4">
        <DropdownMenu>
          <DropdownMenuTrigger className={cn("inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] outline-none hover:bg-accent hover:text-foreground aria-expanded:bg-accent", filtered ? "text-foreground" : "text-muted-foreground")}>
            <FunnelSimpleIcon aria-hidden className="size-3.5" /> Filter <CaretDownIcon aria-hidden className="size-2.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-48">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Status</DropdownMenuLabel>
              {statuses.map((s) => (
                <DropdownMenuItem key={s.key} onClick={() => set({ status: search.status === s.key ? undefined : s.key })}>
                  <span aria-hidden className="size-[7px] rounded-full" style={{ background: s.color }} />
                  <span className="flex-1">{s.label}</span>
                  {search.status === s.key ? <Selected /> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Type</DropdownMenuLabel>
              {(["bug", "feature"] as const).map((t) => (
                <DropdownMenuItem key={t} onClick={() => set({ type: search.type === t ? undefined : t })}>
                  <span className="flex-1">{PRIVATE_TYPE_LABEL[t]}</span>
                  {search.type === t ? <Selected /> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Assignee</DropdownMenuLabel>
              {[{ id: "me", name: "Assigned to me" }, { id: "none", name: "Unassigned" }, ...people].map((p) => (
                <DropdownMenuItem key={p.id} onClick={() => set({ assignee: search.assignee === p.id ? undefined : p.id })}>
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  {search.assignee === p.id ? <Selected /> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        {status ? <Chip label="status" color={status.color} onClear={() => set({ status: undefined })}>{status.label}</Chip> : null}
        {search.type ? <Chip label="type" onClear={() => set({ type: undefined })}>{PRIVATE_TYPE_LABEL[search.type]}</Chip> : null}
        {assigneeLabel ? <Chip label="assignee" onClear={() => set({ assignee: undefined })}>{assigneeLabel}</Chip> : null}
        <span className="flex-1" />
        <span role="status" className="text-xs text-muted-foreground tabular-nums">
          {shown.length} {shown.length === 1 ? "report" : "reports"}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-20 text-center">
          <LockSimpleIcon aria-hidden className="size-5 text-muted-foreground" />
          <p className="text-[15px] font-semibold">{filtered ? "No reports match these filters" : "No private feedback yet"}</p>
          <p className="max-w-sm text-sm text-pretty text-muted-foreground">{filtered ? "Clear the filters to see every report." : "Reports from your app’s private widget land here. Only admins and teammates with access can read them."}</p>
          {filtered ? (
            <Button variant="secondary" size="sm" className="mt-2" onClick={() => navigate({ search: {} })}>
              Clear filters
            </Button>
          ) : (
            <Button size="sm" arrow className="mt-2" nativeButton={false} render={<Link to="/dashboard/settings/private-widget" />}>
              Set up the private widget
            </Button>
          )}
        </div>
      ) : null}
      {needle && shown.length === 0 && rows.length ? (
        <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
          <p className="text-sm text-pretty text-muted-foreground">
            No loaded reports match “<span className="break-all">{q}</span>”. Search covers titles and reporter names.
          </p>
          <Button variant="secondary" size="sm" onClick={() => setQ("")}>
            Clear search
          </Button>
        </div>
      ) : null}

      <ul role="list">
        {shown.map((r) => {
          const st = findStatus(statuses, r.status);
          return (
            <li key={r.id}>
              <Link to="/dashboard/private/$id" params={{ id: r.id }} className="flex min-h-[52px] items-center gap-3 border-t px-4 py-2.5 outline-none [--focus-offset:-2px] transition-colors duration-100 hover:bg-accent/50 focus-visible:bg-accent/50 md:px-5">
                <span aria-hidden className="size-[9px] shrink-0 rounded-full" style={{ background: st.color }} />
                <span className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                  <span className="min-w-0 truncate text-[14px] font-medium" title={r.title}>
                    {r.title}
                  </span>
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
                    <TypeBadge type={r.type} />
                    <span className="whitespace-nowrap">{st.label}</span>
                    <span className="min-w-0 truncate sm:hidden">{r.reporterName}</span>
                  </span>
                </span>
                {r.imageCount ? (
                  <span className="inline-flex shrink-0 items-center gap-1 text-[12px] text-muted-foreground tabular-nums">
                    <ImageIcon aria-hidden className="size-[13px]" /> {r.imageCount}
                    <span className="sr-only">{r.imageCount === 1 ? "screenshot" : "screenshots"}</span>
                  </span>
                ) : null}
                <span className="hidden max-w-[160px] shrink-0 truncate text-[12px] text-muted-foreground sm:block" title={r.reporterName}>
                  {r.reporterName}
                </span>
                <time dateTime={new Date(r.createdAt).toISOString()} title={fullDate(r.createdAt)} className="w-9 shrink-0 text-right text-[12px] text-muted-foreground tabular-nums">
                  {ago(r.createdAt)}
                </time>
                {r.assigneeName ? (
                  <span className="shrink-0" title={`Assigned to ${r.assigneeName}`}>
                    <Avatar name={r.assigneeName} size={22} />
                    <span className="sr-only">Assigned to {r.assigneeName}</span>
                  </span>
                ) : (
                  <span className="size-[22px] shrink-0 rounded-full border border-dashed border-input" title="Unassigned">
                    <span className="sr-only">Unassigned</span>
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      {next ? (
        <div className="flex justify-center border-t py-4">
          <Button variant="secondary" size="sm" onClick={more} disabled={loading}>
            {loading ? "Loading…" : "Load more reports"}
          </Button>
        </div>
      ) : null}
    </Panel>
  );
}

export function TypeBadge({ type }: { type: PrivateType }) {
  return (
    <span className="inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-md bg-secondary px-2 text-[12px] font-medium whitespace-nowrap text-foreground">
      <span aria-hidden className={cn("size-1.5 rounded-full", type === "bug" ? "bg-destructive" : "bg-link")} />
      {PRIVATE_TYPE_LABEL[type]}
    </span>
  );
}

function Selected() {
  return <span className="text-xs text-muted-foreground">Selected</span>;
}

function Chip({ children, label, color, onClear }: { children: React.ReactNode; label: string; color?: string; onClear: () => void }) {
  return (
    <span className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border bg-card pr-0.5 pl-2 text-xs">
      {color ? <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: color }} /> : null}
      <span className="min-w-0 truncate">{children}</span>
      <button type="button" onClick={onClear} aria-label={`Clear ${label} filter`} className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground outline-none hover:bg-accent hover:text-foreground">
        <XIcon aria-hidden className="size-3" />
      </button>
    </span>
  );
}
