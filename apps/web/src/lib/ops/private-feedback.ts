import { membership, privateFeedback, privateFeedbackActivity, user } from "@openheard/db";
import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";

import { objectKey, uploadsBucket } from "@/lib/attachment-db";
import { privateImagePath } from "@/lib/private-feedback";

import { type OpCtx, OpError, needActor } from "./context";
import { stillAuthorized } from "./private-access";

// Private feedback for the dashboard: reading, notes, status and assignment.
// Every query is scoped to ctx.workspace; nothing here edits the original
// submission. Server-only.

export const PAGE_SIZE = 50;
const STALE = "This report changed. Reload and try again.";

export type PrivateCursor = { createdAt: number; id: string };

export async function listPrivateFeedback(ctx: OpCtx, filter: { status?: string; type?: "bug" | "feature"; assignee?: string; cursor?: PrivateCursor }) {
  const { db } = ctx;
  const assignee = filter.assignee === "none" ? isNull(privateFeedback.assigneeId) : filter.assignee ? eq(privateFeedback.assigneeId, filter.assignee === "me" ? needActor(ctx, "Filtering").id : filter.assignee) : undefined;
  const c = filter.cursor;
  const rows = await db
    .select({
      id: privateFeedback.id,
      title: privateFeedback.title,
      type: privateFeedback.type,
      status: privateFeedback.status,
      reporterName: privateFeedback.reporterName,
      assigneeId: privateFeedback.assigneeId,
      assigneeName: user.name,
      imageCount: sql<number>`json_array_length(${privateFeedback.images})`,
      createdAt: privateFeedback.createdAt,
    })
    .from(privateFeedback)
    .leftJoin(user, eq(user.id, privateFeedback.assigneeId))
    .where(
      and(
        eq(privateFeedback.workspaceId, ctx.workspace.id),
        filter.status ? eq(privateFeedback.status, filter.status) : undefined,
        filter.type ? eq(privateFeedback.type, filter.type) : undefined,
        assignee,
        c ? or(lt(privateFeedback.createdAt, new Date(c.createdAt)), and(eq(privateFeedback.createdAt, new Date(c.createdAt)), lt(privateFeedback.id, c.id))) : undefined,
      ),
    )
    .orderBy(desc(privateFeedback.createdAt), desc(privateFeedback.id))
    .limit(PAGE_SIZE + 1);
  const items = rows.slice(0, PAGE_SIZE);
  const last = items[items.length - 1];
  return { items, next: rows.length > PAGE_SIZE && last ? { createdAt: last.createdAt.getTime(), id: last.id } : null };
}

export async function getPrivateFeedback(ctx: OpCtx, id: string) {
  const { db } = ctx;
  const report = await db.query.privateFeedback.findFirst({
    where: and(eq(privateFeedback.id, id), eq(privateFeedback.workspaceId, ctx.workspace.id)),
    with: { assignee: { columns: { id: true, name: true } } },
  });
  if (!report) throw new OpError("Report not found", 404);
  const activity = await db.query.privateFeedbackActivity.findMany({
    where: eq(privateFeedbackActivity.feedbackId, id),
    orderBy: [asc(privateFeedbackActivity.createdAt), asc(privateFeedbackActivity.id)],
    with: { actor: { columns: { name: true, image: true } } },
  });
  // Assignment history names people by id; show their names.
  const ids = [...new Set(activity.flatMap((a) => (a.type === "assign" ? [a.fromValue, a.toValue] : [])).filter((v): v is string => !!v))];
  const people = ids.length ? await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, ids)) : [];
  const names = Object.fromEntries(people.map((p) => [p.id, p.name]));
  return {
    id: report.id,
    type: report.type,
    title: report.title,
    message: report.message,
    reporterName: report.reporterName,
    reporterEmail: report.reporterEmail,
    metadata: report.metadata ? JSON.stringify(JSON.parse(report.metadata), null, 2) : null,
    images: report.images.map((i) => ({ id: i.id, url: privateImagePath(report.id, i.id), contentType: i.contentType, width: i.width, height: i.height })),
    status: report.status,
    assignee: report.assignee,
    createdAt: report.createdAt,
    activity: activity.map((a) => ({
      id: a.id,
      type: a.type,
      body: a.body,
      from: a.type === "assign" && a.fromValue ? (names[a.fromValue] ?? "someone") : a.fromValue,
      to: a.type === "assign" && a.toValue ? (names[a.toValue] ?? "someone") : a.toValue,
      actor: a.actor,
      createdAt: a.createdAt,
    })),
  };
}

const inWorkspace = (ctx: OpCtx, id: string) => sql`EXISTS (SELECT 1 FROM private_feedback WHERE id = ${id} AND workspace_id = ${ctx.workspace.id})`;

export async function addPrivateNote(ctx: OpCtx, id: string, body: string) {
  const actor = needActor(ctx, "A note");
  const text = body.trim();
  if (!text || text.length > 5000) throw new OpError("Notes are 1 to 5000 characters");
  const added = await ctx.db.all<{ id: number }>(
    sql`INSERT INTO private_feedback_activity (feedback_id, actor_id, type, body, created_at) SELECT ${id}, ${actor.id}, 'note', ${text}, ${Date.now()} WHERE ${inWorkspace(ctx, id)} RETURNING id`,
  );
  if (!added.length) throw new OpError("Report not found", 404);
  return { ok: true };
}

// The activity row and the change apply together, and only while the report
// still has the value the reviewer was looking at: a stale tab is refused
// instead of overwriting a newer change.
async function guardedChange(ctx: OpCtx, id: string, kind: "status" | "assign", guard: ReturnType<typeof sql>, to: string | null, set: Partial<typeof privateFeedback.$inferInsert>) {
  const actor = needActor(ctx, "This change");
  const now = Date.now();
  const where = sql`id = ${id} AND workspace_id = ${ctx.workspace.id} AND ${guard}`;
  const current = kind === "status" ? sql`status` : sql`assignee_id`;
  const [, updated] = await ctx.db.batch([
    ctx.db.run(sql`INSERT INTO private_feedback_activity (feedback_id, actor_id, type, from_value, to_value, created_at) SELECT id, ${actor.id}, ${kind}, ${current}, ${to}, ${now} FROM private_feedback WHERE ${where}`),
    ctx.db
      .update(privateFeedback)
      .set({ ...set, updatedAt: new Date(now) })
      .where(where)
      .returning({ id: privateFeedback.id }),
  ]);
  return updated.length > 0;
}

export async function setPrivateStatus(ctx: OpCtx, id: string, from: string, to: string) {
  if (from === to) return { changed: false };
  const known = sql`EXISTS (SELECT 1 FROM status st WHERE st.workspace_id = ${ctx.workspace.id} AND st.key = ${to})`;
  const ok = await guardedChange(ctx, id, "status", sql`status = ${from} AND ${known}`, to, { status: to, statusChangedAt: new Date() });
  if (!ok) throw new OpError(STALE, 409);
  return { changed: true };
}

export async function assignPrivateFeedback(ctx: OpCtx, id: string, from: string | null, to: string | null) {
  if (from === to) return { changed: false };
  const allowed = to ? stillAuthorized(ctx.workspace.id, to) : sql`1`;
  const ok = await guardedChange(ctx, id, "assign", sql`assignee_id IS ${from} AND ${allowed}`, to, { assigneeId: to });
  if (ok) return { changed: true };
  if (to && !(await listPrivateAssignees(ctx)).some((p) => p.id === to)) throw new OpError("That person no longer has access.", 409);
  throw new OpError(STALE, 409);
}

// Admin only (the caller checks). The images go after the row; one that fails
// to delete is left for the nightly orphan sweep.
export async function deletePrivateFeedback(ctx: OpCtx, id: string) {
  const [gone] = await ctx.db
    .delete(privateFeedback)
    .where(and(eq(privateFeedback.id, id), eq(privateFeedback.workspaceId, ctx.workspace.id)))
    .returning({ images: privateFeedback.images });
  if (!gone) throw new OpError("Report not found", 404);
  const keys = gone.images.map((i) => objectKey(ctx.workspace.id, i.id));
  const bucket = uploadsBucket();
  if (keys.length && bucket) await bucket.delete(keys).catch((err: unknown) => console.error("[private-feedback] could not delete images", keys, err instanceof Error ? err.message : err));
  return { deleted: id };
}

// People a report can be assigned to: admins and granted teammates.
export async function listPrivateAssignees(ctx: OpCtx) {
  return ctx.db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(membership)
    .innerJoin(user, eq(user.id, membership.userId))
    .where(and(eq(membership.workspaceId, ctx.workspace.id), or(eq(membership.role, "admin"), eq(membership.privateAccess, true))))
    .orderBy(asc(user.name));
}
