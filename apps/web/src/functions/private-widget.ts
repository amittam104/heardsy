import { createDb } from "@openheard/db";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { adminOps, privateOps } from "@/lib/ops/session";
import {
  getPrivateWidgetSettings as getPrivateWidgetSettingsOp,
  privateWidgetConfig,
  savePrivateWidgetOrigins as savePrivateWidgetOriginsOp,
  savePrivateWidgetSettings as savePrivateWidgetSettingsOp,
} from "@/lib/ops/private-widget";
import { privateWidgetSettingsSchema } from "@/lib/private-widget-settings";
import { sessionMiddleware } from "@/lib/session";

// The frame's appearance, for the receiver it names. No session: the frame
// renders from this alone, never from the host workspace or the visitor.
export const getPrivateWidgetConfig = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ workspace: z.string().max(64) }).parse(d))
  .handler(async ({ data }) => {
    const { privateReceiver } = await import("@/lib/private-receiver");
    const ws = await privateReceiver(getRequest(), data.workspace);
    return ws ? privateWidgetConfig(createDb(), ws) : null;
  });

export const getPrivateWidgetSettings = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .handler(async ({ context }) => getPrivateWidgetSettingsOp(privateOps(context)));

// Appearance and logo: admins and granted teammates.
export const savePrivateWidgetSettings = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ settings: privateWidgetSettingsSchema, logoId: z.string().max(64).nullable().optional() }).parse(d))
  .handler(async ({ data, context }) => savePrivateWidgetSettingsOp(privateOps(context), data.settings, data.logoId));

// Which sites may embed it: admins only.
export const savePrivateWidgetOrigins = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ origins: z.string().max(4000) }).parse(d))
  .handler(async ({ data, context }) => savePrivateWidgetOriginsOp(adminOps(context), data.origins));
