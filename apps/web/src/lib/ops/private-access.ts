import type { Db } from "@openheard/db";
import { sql } from "drizzle-orm";

// Whether a person may still read this workspace's private feedback, as seen
// by statements that run after a membership write in the same batch.
export const stillAuthorized = (workspaceId: string, userId: string) =>
  sql`EXISTS (SELECT 1 FROM membership m WHERE m.workspace_id = ${workspaceId} AND m.user_id = ${userId} AND (m.role = 'admin' OR m.private_access = 1))`;

// Goes in the same db.batch as a membership write that may remove access:
// reports assigned to someone who lost access become unassigned, with an
// `assign` activity row each. Both are no-ops while access remains.
export function clearRevokedAssignments(db: Db, workspaceId: string, userId: string, actorId: string) {
  const now = Date.now();
  const gone = sql`workspace_id = ${workspaceId} AND assignee_id = ${userId} AND NOT ${stillAuthorized(workspaceId, userId)}`;
  return [
    db.run(sql`INSERT INTO private_feedback_activity (feedback_id, actor_id, type, from_value, to_value, created_at) SELECT id, ${actorId}, 'assign', assignee_id, NULL, ${now} FROM private_feedback WHERE ${gone}`),
    db.run(sql`UPDATE private_feedback SET assignee_id = NULL, updated_at = ${now} WHERE ${gone}`),
  ] as const;
}
