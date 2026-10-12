import { createDb } from "@openheard/db";
import { getRequest } from "@tanstack/react-start/server";

import { type Ctx, requireAdmin, requirePrivateAccess } from "@/lib/session";

import type { OpCtx } from "./context";

export function requestOrigin(): string {
  try {
    return new URL(getRequest().url).origin;
  } catch {
    return "";
  }
}

// The op context for a dashboard server function. Admins only.
export function adminOps(context: Ctx): OpCtx {
  const u = requireAdmin(context.user);
  return { db: createDb(), workspace: context.workspace, actor: { id: u.id, name: u.name, email: u.email }, origin: requestOrigin() };
}

// The op context for private feedback: admins and granted teammates, always
// scoped to the workspace the request resolved to.
export function privateOps(context: Ctx): OpCtx {
  const u = requirePrivateAccess(context.user);
  return { db: createDb(), workspace: context.workspace, actor: { id: u.id, name: u.name, email: u.email }, origin: requestOrigin() };
}
