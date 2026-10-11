import { createDb, membership } from "@openheard/db";
import { invite } from "@openheard/db/schema/feedback";
import { createServerFn } from "@tanstack/react-start";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { assertNotDemo, assertNotDemoIdentity } from "@/lib/demo";
import { clearRevokedAssignments } from "@/lib/ops/private-access";
import { requireAdmin, sessionMiddleware } from "@/lib/session";
import { adminOps } from "@/lib/ops/session";
import { createInvite as createInviteOp } from "@/lib/ops/workspace";

export const getWorkspaceMemberCount = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .handler(async ({ context }) => {
    const db = createDb();
    const [row] = await db
      .select({ n: sql<number>`count(*)` })
      .from(membership)
      .where(eq(membership.workspaceId, context.workspace.id));
    return row.n;
  });

export const createInvite = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) =>
    z.object({ email: z.string().email(), role: z.enum(["admin", "member"]).default("member"), privateAccess: z.boolean().default(false) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await createInviteOp(adminOps(context), data);
    return { ok: true };
  });

export const listInvites = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .handler(async ({ context }) => {
    requireAdmin(context.user);
    assertNotDemo(context.workspace);
    const db = createDb();
    return db
      .select()
      .from(invite)
      .where(and(eq(invite.workspaceId, context.workspace.id), isNull(invite.acceptedAt)))
      .orderBy(invite.createdAt);
  });

export const revokeInvite = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ token: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    requireAdmin(context.user);
    assertNotDemo(context.workspace);
    const db = createDb();
    await db
      .delete(invite)
      .where(and(eq(invite.workspaceId, context.workspace.id), eq(invite.token, data.token)));
    return { ok: true };
  });

export const acceptInvite = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ token: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const user = context.user;
    if (!user) throw new Error("Sign in first");
    assertNotDemoIdentity(user);
    const db = createDb();
    const [inv] = await db
      .select()
      .from(invite)
      .where(and(eq(invite.token, data.token), gt(invite.expiresAt, new Date()), isNull(invite.acceptedAt)));
    if (!inv) throw new Error("Invite not found or expired");
    // A token is an invitation to one address, not a bearer credential.
    if (inv.email.toLowerCase() !== user.email.toLowerCase()) throw new Error("Sign in with the invited email");

    // An invitation adds access and never takes any away: an admin stays an
    // admin and a granted teammate keeps the grant.
    await db
      .insert(membership)
      .values({ workspaceId: inv.workspaceId, userId: user.id, role: inv.role, privateAccess: inv.privateAccess })
      .onConflictDoUpdate({
        target: [membership.workspaceId, membership.userId],
        set: {
          role: sql`CASE WHEN ${membership.role} = 'admin' THEN 'admin' ELSE excluded.role END`,
          privateAccess: sql`max(${membership.privateAccess}, excluded.private_access)`,
        },
      });
    await db.update(invite).set({ acceptedAt: new Date() }).where(eq(invite.token, data.token));
    return { workspaceId: inv.workspaceId };
  });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ userId: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const me = requireAdmin(context.user);
    assertNotDemo(context.workspace);
    if (data.userId === me.id) throw new Error("You cannot remove yourself");
    const db = createDb();
    await db.batch([
      db.delete(membership).where(and(eq(membership.workspaceId, context.workspace.id), eq(membership.userId, data.userId))),
      ...clearRevokedAssignments(db, context.workspace.id, data.userId, me.id),
    ]);
    return { ok: true };
  });
