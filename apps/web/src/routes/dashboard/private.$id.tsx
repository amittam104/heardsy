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
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      await router.invalidate();
    } finally {
      setBusy(false);
    }
  }

  const sendNote = () => note.trim() && run(() => addPrivateNote({ data: { id: report.id, body: note } }).then(() => setNote("")));

  return (
    <Panel
      title={
        <Link to="/dashboard/private" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" /> Private feedback
        </Link>
      }
    >
      <div className="flex flex-col md:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-5 px-6 py-5">
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-faint">
              <TypeBadge type={report.type} />
              <StatusChip status={report.status} showOpen />
              <span className="tabular-nums" title={fullDate(report.createdAt)}>
                {ago(report.createdAt)}
              </span>
            </div>
            <h1 className="text-[19px] leading-snug font-semibold tracking-[-0.02em]">{report.title}</h1>
            <div className="max-w-[70ch] whitespace-pre-wrap text-[15px] leading-[1.6] text-muted-foreground">{report.message}</div>
            <AttachmentGallery items={report.images} className="max-w-[70ch] pt-1" />
          </div>

          <section className="flex flex-col gap-1.5 border-t pt-4">
            <h2 className="text-xs font-medium text-muted-foreground">Reporter</h2>
            <p className="text-[13px]">
              {report.reporterName} <span className="text-muted-foreground">· {report.reporterEmail}</span>
            </p>
            <p className="text-xs text-faint">Supplied with the report. Heardsy has not verified these details.</p>
          </section>

          <section className="flex flex-col gap-1.5 border-t pt-4">
            <h2 className="text-xs font-medium text-muted-foreground">App metadata</h2>
            {report.metadata ? (
              <pre className="max-h-[320px] max-w-[70ch] overflow-auto rounded-lg border bg-card px-3 py-2.5 font-mono text-[12px]/5 whitespace-pre-wrap break-all text-muted-foreground">{report.metadata}</pre>
            ) : (
              <p className="text-[13px] text-faint">None sent.</p>
            )}
          </section>

          <section className="flex flex-col gap-3 border-t pt-4">
            <h2 className="text-xs font-medium text-muted-foreground">Internal notes and history</h2>
            <div className="flex flex-col gap-3 rounded-lg border bg-card px-3.5 pt-3 pb-2.5 focus-within:border-input">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={5000}
                placeholder="Add a note for the team"
                aria-label="Internal note"
                className="w-full resize-none bg-transparent text-[13px] leading-relaxed outline-none placeholder:text-faint"
                onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && sendNote()}
              />
              <div className="flex justify-end">
                <Button size="sm" arrow onClick={sendNote} disabled={busy || !note.trim()}>
                  Add note
                </Button>
              </div>
            </div>
            {report.activity.length === 0 ? <p className="text-[13px] text-faint">No notes yet.</p> : null}
            {[...report.activity].reverse().map((a) => (
              <div key={a.id} className="flex items-start gap-2.5">
                <Avatar name={a.actor?.name ?? "?"} image={a.actor?.image} size={24} />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2 text-[13px]">
                    <span className="font-semibold">{a.actor?.name ?? "someone"}</span>
                    <span className="text-[12px] text-faint tabular-nums">{ago(a.createdAt)}</span>
                  </div>
                  {a.type === "note" ? (
                    <div className="whitespace-pre-wrap text-[14px] leading-[1.55] text-muted-foreground">{a.body}</div>
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
        </div>

        <aside className="flex w-full shrink-0 flex-col gap-4 border-t px-5 py-5 md:w-[260px] md:border-t-0 md:border-l">
          <Field label="Status">
            <DropdownMenu>
              <DropdownMenuTrigger disabled={busy} className="inline-flex h-8 w-full items-center gap-2 rounded-md border border-input bg-card px-2.5 text-[13px] outline-none hover:bg-accent disabled:opacity-60">
                <span className="size-[7px] rounded-full" style={{ background: status.color }} />
                <span className="flex-1 truncate text-left">{status.label}</span>
                <CaretDownIcon className="size-2.5 text-faint" />
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
              <DropdownMenuTrigger disabled={busy} className="inline-flex h-8 w-full items-center gap-2 rounded-md border border-input bg-card px-2.5 text-[13px] outline-none hover:bg-accent disabled:opacity-60">
                {report.assignee ? <Avatar name={report.assignee.name} size={18} /> : null}
                <span className="flex-1 truncate text-left">{report.assignee?.name ?? "Unassigned"}</span>
                <CaretDownIcon className="size-2.5 text-faint" />
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
          <p className="text-xs text-faint">Only this workspace's admins and teammates with private feedback access see this report.</p>
          {admin ? (
            <Button variant="secondary" size="sm" className="self-start text-destructive" onClick={() => setConfirming(true)}>
              <TrashIcon className="size-3.5" /> Delete report
            </Button>
          ) : null}
        </aside>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this report?</DialogTitle>
            <DialogDescription>The report, its notes, history and screenshots are removed for good. Closing it keeps everything instead.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await deletePrivateFeedback({ data: { id: report.id } });
                  toast.success("Report deleted");
                  await navigate({ to: "/dashboard/private" });
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Could not delete");
                  setBusy(false);
                }
              }}
            >
              Delete for good
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
