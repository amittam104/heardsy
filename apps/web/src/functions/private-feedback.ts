import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  addPrivateNote as addPrivateNoteOp,
  assignPrivateFeedback as assignPrivateFeedbackOp,
  deletePrivateFeedback as deletePrivateFeedbackOp,
  getPrivateFeedback as getPrivateFeedbackOp,
  listPrivateAssignees as listPrivateAssigneesOp,
  listPrivateFeedback as listPrivateFeedbackOp,
  setPrivateStatus as setPrivateStatusOp,
} from "@/lib/ops/private-feedback";
import { adminOps, privateOps } from "@/lib/ops/session";
import { sessionMiddleware } from "@/lib/session";

// The private inbox. Admins and granted teammates of the workspace the
// request resolves to; the workspace never comes from the caller.

const reportId = z.string().min(1).max(64);

export const listPrivateFeedback = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) =>
    z
      .object({
        status: z.string().max(40).optional(),
        type: z.enum(["bug", "feature"]).optional(),
        assignee: z.string().max(64).optional(),
        cursor: z.object({ createdAt: z.number().int(), id: reportId }).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => listPrivateFeedbackOp(privateOps(context), data));

export const getPrivateFeedback = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ id: reportId }).parse(d))
  .handler(async ({ data, context }) => getPrivateFeedbackOp(privateOps(context), data.id));

export const addPrivateNote = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ id: reportId, body: z.string().trim().min(1, "Write a note first").max(5000) }).parse(d))
  .handler(async ({ data, context }) => addPrivateNoteOp(privateOps(context), data.id, data.body));

// `from` is the value the reviewer saw; a report changed since is refused.
export const setPrivateStatus = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ id: reportId, from: z.string().min(1).max(40), to: z.string().min(1).max(40) }).parse(d))
  .handler(async ({ data, context }) => setPrivateStatusOp(privateOps(context), data.id, data.from, data.to));

export const assignPrivateFeedback = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ id: reportId, from: z.string().max(64).nullable(), to: z.string().max(64).nullable() }).parse(d))
  .handler(async ({ data, context }) => assignPrivateFeedbackOp(privateOps(context), data.id, data.from, data.to));

export const deletePrivateFeedback = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ id: reportId }).parse(d))
  .handler(async ({ data, context }) => deletePrivateFeedbackOp(adminOps(context), data.id));

export const listPrivateAssignees = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .handler(async ({ context }) => listPrivateAssigneesOp(privateOps(context)));
