import { Button } from "@openheard/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@openheard/ui/components/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@openheard/ui/components/dropdown-menu";
import { ArrowLeftIcon, CaretDownIcon, TrashIcon } from "@phosphor-icons/react";
import { Link, createFileRoute, useLoaderData, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Panel } from "@/components/admin/panel";
import { AttachmentGallery } from "@/components/attachments";
import { Avatar, StatusChip } from "@/components/bits";
import { DashboardErrorState, DashboardPanelSkeleton } from "@/components/states";
import { addPrivateNote, assignPrivateFeedback, deletePrivateFeedback, getPrivateFeedback, listPrivateAssignees, setPrivateStatus } from "@/functions/private-feedback";
import { findStatus, useStatuses } from "@/lib/status";
import { ago, fullDate } from "@/lib/time";
import { TypeBadge } from "@/routes/dashboard/private.index";

export const Route = createFileRoute("/dashboard/private/$id")({
  loader: async ({ params }) => {
    const [report, people] = await Promise.all([getPrivateFeedback({ data: { id: params.id } }), listPrivateAssignees()]);
    return { report, people };
  },
  head: ({ loaderData }) => ({ meta: [{ title: loaderData ? `${loaderData.report.title} · Private feedback` : "Private feedback" }] }),
  component: PrivateReport,
  errorComponent: ({ error }) => <DashboardErrorState message={(error as Error)?.message} retry="/dashboard/private" />,
  pendingComponent: DashboardPanelSkeleton,
});

function PrivateReport() {
  const { report, people } = Route.useLoaderData();
  const root = useLoaderData({ from: "__root__" });
  const router = useRouter();
  const navigate = useNavigate();
  const statuses = useStatuses();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const admin = root.user?.role === "admin";
  const status = findStatus(statuses, report.status);

  async function run(work: () => Promise<unknown>, done?: string) {
    setBusy(true);
    try {
      await work();
      await router.invalidate();
      if (done) toast.success(done);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to save the change. Check your connection and try again.");
      await router.invalidate();
    } finally {
      setBusy(false);
    }
  }

  const sendNote = () => note.trim() && run(() => addPrivateNote({ data: { id: report.id, body: note } }).then(() => setNote("")));

  return (
    <Panel
      title={
        <Link to="/dashboard/private" className="inline-flex items-center gap-2 rounded-md text-muted-foreground outline-none hover:text-foreground">
          <ArrowLeftIcon aria-hidden className="size-4" /> Private feedback
        </Link>
      }
    >
      <div className="flex flex-col md:flex-row">
        <article className="flex min-w-0 flex-1 flex-col gap-6 px-4 py-5 md:px-6">
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <TypeBadge type={report.type} />
              <StatusChip status={report.status} showOpen />
              <time dateTime={new Date(report.createdAt).toISOString()} className="tabular-nums" title={fullDate(report.createdAt)}>
                {ago(report.createdAt)}
              </time>
            </div>
            <h1 className="text-xl leading-snug font-semibold tracking-[-0.02em] text-pretty break-words">{report.title}</h1>
            <div className="max-w-[70ch] text-[15px] leading-[1.6] break-words whitespace-pre-wrap text-foreground/90">{report.message}</div>
            <AttachmentGallery items={report.images} className="max-w-[70ch] pt-1" />
          </div>

          <section aria-labelledby="reporter" className="flex flex-col gap-1.5 border-t pt-4">
            <h2 id="reporter" className="text-xs font-medium text-muted-foreground">
              Reporter
            </h2>
            <p className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
              <span className="font-medium break-words">{report.reporterName}</span>
              <a href={`mailto:${report.reporterEmail}`} className="break-all text-link hover:underline">
                {report.reporterEmail}
              </a>
            </p>
            <p className="text-xs text-muted-foreground">Supplied with the report. Heardsy has not verified these details.</p>
          </section>

          <section aria-labelledby="metadata" className="flex flex-col gap-1.5 border-t pt-4">
            <h2 id="metadata" className="text-xs font-medium text-muted-foreground">
              App metadata
            </h2>
            {report.metadata ? (
              <pre tabIndex={0} aria-label="App metadata" className="max-h-[320px] max-w-[70ch] overflow-auto rounded-lg border bg-card px-3 py-2.5 font-mono text-[12px]/5 break-all whitespace-pre-wrap text-muted-foreground outline-none">
                {report.metadata}
              </pre>
            ) : (
              <p className="text-[13px] text-muted-foreground">The app sent no metadata with this report.</p>
            )}
          </section>

          <section aria-labelledby="notes" className="flex flex-col gap-3 border-t pt-4">
            <h2 id="notes" className="text-xs font-medium text-muted-foreground">
              Internal notes and history
            </h2>
            <div className="flex flex-col gap-3 rounded-lg border bg-card px-3.5 pt-3 pb-2.5 focus-within:border-ring/60 focus-within:ring-2 focus-within:ring-ring/30">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={5000}
                placeholder="Add a note for the team"
                aria-label="Internal note"
                aria-describedby="note-hint"
                className="w-full resize-y bg-transparent text-base leading-relaxed outline-none placeholder:text-muted-foreground sm:text-[13px]"
                onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && sendNote()}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span id="note-hint" className="text-xs text-muted-foreground">
                  Only your team sees notes. <span className="hidden sm:inline">⌘ Enter to add.</span>
                </span>
                <Button size="sm" arrow onClick={sendNote} disabled={busy || !note.trim()}>
                  Add note
                </Button>
              </div>
            </div>
            {report.activity.length === 0 ? <p className="text-[13px] text-muted-foreground">No notes or changes yet.</p> : null}
            {[...report.activity].reverse().map((a) => (
              <div key={a.id} className="flex items-start gap-2.5">
                <Avatar name={a.actor?.name ?? "?"} image={a.actor?.image} size={24} />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2 text-[13px]">
                    <span className="font-semibold">{a.actor?.name ?? "someone"}</span>
                    <time dateTime={new Date(a.createdAt).toISOString()} title={fullDate(a.createdAt)} className="text-[12px] text-muted-foreground tabular-nums">
                      {ago(a.createdAt)}
                    </time>
                  </div>
                  {a.type === "note" ? (
                    <div className="text-[14px] leading-[1.55] break-words whitespace-pre-wrap text-muted-foreground">{a.body}</div>
                  ) : a.type === "status" ? (
                    <span className="inline-flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                      moved to {a.to ? <StatusChip status={a.to} showOpen /> : "no status"}
                    </span>
                  ) : (
                    <span className="text-[13px] text-muted-foreground">{a.to ? `assigned ${a.to}` : a.from ? `unassigned ${a.from}` : "changed the assignee"}</span>
                  )}
                </div>
              </div>
            ))}
          </section>
        </article>

        <aside aria-label="Report details" className="flex w-full shrink-0 flex-col gap-4 border-t px-4 py-5 md:w-[260px] md:border-t-0 md:border-l md:px-5">
          <Field label="Status">
            <DropdownMenu>
              <DropdownMenuTrigger disabled={busy} aria-label={`Status: ${status.label}. Change status`} className={TRIGGER}>
                <span aria-hidden className="size-[7px] shrink-0 rounded-full" style={{ background: status.color }} />
                <span className="flex-1 truncate text-left">{status.label}</span>
                <CaretDownIcon aria-hidden className="size-2.5 shrink-0 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-52">
                {statuses.map((s) => (
                  <DropdownMenuItem key={s.key} disabled={s.key === report.status} onClick={() => run(() => setPrivateStatus({ data: { id: report.id, from: report.status, to: s.key } }), `Moved to ${s.label}`)}>
                    <span className="size-[7px] rounded-full" style={{ background: s.color }} />
                    {s.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </Field>
          <Field label="Assignee">
            <DropdownMenu>
              <DropdownMenuTrigger disabled={busy} aria-label={`Assignee: ${report.assignee?.name ?? "Unassigned"}. Change assignee`} className={TRIGGER}>
                {report.assignee ? <Avatar name={report.assignee.name} size={18} /> : null}
                <span className="flex-1 truncate text-left">{report.assignee?.name ?? "Unassigned"}</span>
                <CaretDownIcon aria-hidden className="size-2.5 shrink-0 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-52">
                {people.map((p) => (
                  <DropdownMenuItem key={p.id} disabled={p.id === report.assignee?.id} onClick={() => run(() => assignPrivateFeedback({ data: { id: report.id, from: report.assignee?.id ?? null, to: p.id } }), `Assigned to ${p.name}`)}>
                    {p.name}
                  </DropdownMenuItem>
                ))}
                {report.assignee ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => run(() => assignPrivateFeedback({ data: { id: report.id, from: report.assignee?.id ?? null, to: null } }), "Unassigned")}>Unassign</DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </Field>
          <p className="text-xs text-pretty text-muted-foreground">Only this workspace’s admins and teammates with private feedback access see this report.</p>
          {admin ? (
            <Button variant="destructive" size="sm" className="self-start" onClick={() => setConfirming(true)}>
              <TrashIcon aria-hidden className="size-3.5" /> Delete report
            </Button>
          ) : null}
        </aside>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this report?</DialogTitle>
            <DialogDescription>The report, its notes, history and screenshots are removed for good. To keep them, set the status to closed instead.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" size="sm" autoFocus onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await deletePrivateFeedback({ data: { id: report.id } });
                  toast.success("Report deleted");
                  await navigate({ to: "/dashboard/private" });
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Unable to delete the report. Check your connection and try again.");
                  setBusy(false);
                }
              }}
            >
              {busy ? "Deleting…" : "Delete report"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

const TRIGGER = "inline-flex h-9 w-full items-center gap-2 rounded-md border border-input bg-card px-2.5 text-[13px] outline-none hover:bg-accent disabled:opacity-60 aria-expanded:bg-accent";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span aria-hidden className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
