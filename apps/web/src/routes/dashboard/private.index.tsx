import { Button } from "@openheard/ui/components/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@openheard/ui/components/dropdown-menu";
import { cn } from "@openheard/ui/lib/utils";
import { CaretDownIcon, FunnelSimpleIcon, ImageIcon, LockSimpleIcon, XIcon } from "@phosphor-icons/react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Panel } from "@/components/admin/panel";
import { Avatar } from "@/components/bits";
import { DashboardErrorState, DashboardPanelSkeleton } from "@/components/states";
import { listPrivateAssignees, listPrivateFeedback } from "@/functions/private-feedback";
import { PRIVATE_TYPE_LABEL, type PrivateType } from "@/lib/private-feedback";
import { findStatus, useStatuses } from "@/lib/status";
import { ago } from "@/lib/time";

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
  useEffect(() => {
    setRows(page.items);
    setNext(page.next);
  }, [page]);

  async function more() {
    if (!next) return;
    setLoading(true);
    try {
      const res = await listPrivateFeedback({ data: { ...search, cursor: next } });
      setRows((r) => [...r, ...res.items]);
      setNext(res.next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load more");
    } finally {
      setLoading(false);
    }
  }

  const needle = q.trim().toLowerCase();
  const shown = needle ? rows.filter((r) => r.title.toLowerCase().includes(needle) || r.reporterName.toLowerCase().includes(needle)) : rows;
  const filtered = !!(search.status || search.type || search.assignee);
  const set = (patch: Partial<Search>) => navigate({ search: (p) => ({ ...p, ...patch }) });
  const status = search.status ? findStatus(statuses, search.status) : null;
  const assigneeLabel = search.assignee === "me" ? "Assigned to me" : search.assignee === "none" ? "Unassigned" : people.find((p) => p.id === search.assignee)?.name;

  return (
    <Panel title="Private feedback" onSearch={setQ}>
      <div className="flex items-center gap-1.5 px-3 pt-3 pb-2.5">
        <DropdownMenu>
          <DropdownMenuTrigger className={cn("inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] outline-none hover:bg-accent hover:text-foreground", filtered ? "text-foreground" : "text-muted-foreground")}>
            <FunnelSimpleIcon className="size-3.5" /> Filter <CaretDownIcon className="size-2.5 text-faint" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-48">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Status</DropdownMenuLabel>
              {statuses.map((s) => (
                <DropdownMenuItem key={s.key} onClick={() => set({ status: search.status === s.key ? undefined : s.key })}>
                  <span className="size-[7px] rounded-full" style={{ background: s.color }} />
                  {s.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Type</DropdownMenuLabel>
              {(["bug", "feature"] as const).map((t) => (
                <DropdownMenuItem key={t} onClick={() => set({ type: search.type === t ? undefined : t })}>
                  {PRIVATE_TYPE_LABEL[t]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Assignee</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => set({ assignee: search.assignee === "me" ? undefined : "me" })}>Assigned to me</DropdownMenuItem>
              <DropdownMenuItem onClick={() => set({ assignee: search.assignee === "none" ? undefined : "none" })}>Unassigned</DropdownMenuItem>
              {people.map((p) => (
                <DropdownMenuItem key={p.id} onClick={() => set({ assignee: search.assignee === p.id ? undefined : p.id })}>
                  {p.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        {status ? <Chip color={status.color} onClear={() => set({ status: undefined })}>{status.label}</Chip> : null}
        {search.type ? <Chip onClear={() => set({ type: undefined })}>{PRIVATE_TYPE_LABEL[search.type]}</Chip> : null}
        {assigneeLabel ? <Chip onClear={() => set({ assignee: undefined })}>{assigneeLabel}</Chip> : null}
        <span className="flex-1" />
        <span className="text-xs text-faint tabular-nums">{shown.length}</span>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
          <LockSimpleIcon className="size-5 text-faint" />
          <p className="text-sm text-faint">{filtered ? "Nothing matches these filters." : "No private feedback yet. Install the private widget from Settings to start receiving reports."}</p>
        </div>
      ) : null}
      {needle && shown.length === 0 && rows.length ? <p className="px-5 py-10 text-center text-sm text-faint">Nothing matches “{q}”.</p> : null}

      {shown.map((r) => {
        const st = findStatus(statuses, r.status);
        return (
          <Link key={r.id} to="/dashboard/private/$id" params={{ id: r.id }} className="flex h-[50px] shrink-0 items-center gap-3.5 border-t px-5 transition-colors duration-100 hover:bg-accent/50">
            <span className="size-[9px] shrink-0 rounded-full" style={{ background: st.color }} title={st.label} />
            <span className="min-w-0 truncate text-[14px] font-medium">{r.title}</span>
            <TypeBadge type={r.type} />
            <span className="flex-1" />
            {r.imageCount ? (
              <span className="inline-flex items-center gap-1 text-[12px] text-faint tabular-nums">
                <ImageIcon className="size-[13px]" /> {r.imageCount}
              </span>
            ) : null}
            <span className="hidden max-w-[160px] truncate text-[12px] text-muted-foreground sm:block">{r.reporterName}</span>
            <span className="w-9 text-right text-[12px] text-faint tabular-nums">{ago(r.createdAt)}</span>
            {r.assigneeName ? <Avatar name={r.assigneeName} size={22} /> : <span className="size-[22px] rounded-full border border-dashed border-input" title="Unassigned" />}
          </Link>
        );
      })}

      {next ? (
        <div className="flex justify-center border-t py-4">
          <Button variant="secondary" size="sm" onClick={more} disabled={loading}>
            {loading ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : null}
    </Panel>
  );
}

export function TypeBadge({ type }: { type: PrivateType }) {
  return (
    <span className={cn("inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-md bg-secondary px-2 text-[12px] font-medium whitespace-nowrap", type === "bug" ? "text-[#e5484d]" : "text-muted-foreground")}>
      <span className={cn("size-1.5 rounded-full", type === "bug" ? "bg-[#e5484d]" : "bg-link")} />
      {PRIVATE_TYPE_LABEL[type]}
    </span>
  );
}

function Chip({ children, color, onClear }: { children: React.ReactNode; color?: string; onClear: () => void }) {
  return (
    <span className="inline-flex h-[26px] items-center gap-1.5 rounded-md border bg-card pr-1 pl-2 text-xs">
      {color ? <span className="size-1.5 rounded-full" style={{ background: color }} /> : null}
      {children}
      <button type="button" onClick={onClear} aria-label="Clear filter" className="inline-flex size-5 items-center justify-center rounded text-faint hover:bg-accent hover:text-foreground">
        <XIcon className="size-3" />
      </button>
    </span>
  );
}
