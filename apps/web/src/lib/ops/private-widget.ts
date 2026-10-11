import { privateWidget } from "@openheard/db";
import type { Db } from "@openheard/db";
import { eq } from "drizzle-orm";

import { objectKey, uploadsBucket } from "@/lib/attachment-db";
import { IMAGE_TYPES } from "@/lib/attachments";
import { purgePrivateWidgetConfig } from "@/lib/cache";
import { assertNotDemo } from "@/lib/demo";
import { PRIVATE_LOGO_ID, privateLogoPath } from "@/lib/private-feedback";
import { type PrivateWidgetConfig, type PrivateWidgetSettings, privateWidgetSettingsSchema, readPrivateWidgetSettings } from "@/lib/private-widget-settings";
import { MAX_EMBED_ORIGINS, parseEmbedOrigins } from "@/lib/widget-origins";

import { type OpCtx, OpError, needActor } from "./context";

// The private widget's saved appearance, logo and allowed sites. Server-only.

export async function readPrivateWidget(db: Db, workspaceId: string) {
  const [row] = await db.select().from(privateWidget).where(eq(privateWidget.workspaceId, workspaceId)).limit(1);
  return row ?? null;
}

// What any site may read about a receiver: its name and the widget's look.
export async function privateWidgetConfig(db: Db, ws: { id: string; name: string }): Promise<PrivateWidgetConfig> {
  const row = await readPrivateWidget(db, ws.id);
  return { name: ws.name, logoUrl: row?.logoId ? privateLogoPath(ws.id, row.logoId) : null, settings: readPrivateWidgetSettings(row?.settings) };
}

export async function getPrivateWidgetSettings(ctx: OpCtx) {
  const row = await readPrivateWidget(ctx.db, ctx.workspace.id);
  return {
    settings: readPrivateWidgetSettings(row?.settings),
    origins: row?.origins ?? null,
    logoId: row?.logoId ?? null,
    logoUrl: row?.logoId ? privateLogoPath(ctx.workspace.id, row.logoId) : null,
  };
}

const IMAGE = new Set<string>(IMAGE_TYPES);

// A new logo must be one the private logo upload stored for this workspace:
// that route is the only one that hands out `pl_` ids.
async function assertOwnLogo(ctx: OpCtx, logoId: string) {
  const retry = new OpError("Upload the logo again.");
  if (!PRIVATE_LOGO_ID.test(logoId)) throw retry;
  const object = await uploadsBucket()?.get(objectKey(ctx.workspace.id, logoId));
  if (!object) throw retry;
  await object.body.cancel().catch(() => {});
  if (!IMAGE.has(object.httpMetadata?.contentType ?? "")) throw retry;
}

// `logoId` undefined keeps the current logo; null removes it.
export async function savePrivateWidgetSettings(ctx: OpCtx, settings: PrivateWidgetSettings, logoId?: string | null) {
  assertNotDemo(ctx.workspace);
  const actor = needActor(ctx, "Saving the private widget");
  const data = privateWidgetSettingsSchema.parse(settings);
  const before = await readPrivateWidget(ctx.db, ctx.workspace.id);
  if (logoId && logoId !== before?.logoId) await assertOwnLogo(ctx, logoId);
  const set = { settings: data, updatedAt: new Date(), updatedBy: actor.id, ...(logoId !== undefined ? { logoId } : {}) };
  await ctx.db
    .insert(privateWidget)
    .values({ workspaceId: ctx.workspace.id, ...set })
    .onConflictDoUpdate({ target: privateWidget.workspaceId, set });
  const replaced = logoId !== undefined && before?.logoId && before.logoId !== logoId ? before.logoId : null;
  if (replaced) await uploadsBucket()?.delete(objectKey(ctx.workspace.id, replaced)).catch((err: unknown) => console.error("[private-widget] could not delete old logo", err instanceof Error ? err.message : err));
  void purgePrivateWidgetConfig(ctx.origin, ctx.workspace.id);
  return getPrivateWidgetSettings(ctx);
}

// Admin only (the caller checks). None saved means no other site can embed it.
export async function savePrivateWidgetOrigins(ctx: OpCtx, input: string) {
  assertNotDemo(ctx.workspace);
  const { origins, invalid } = parseEmbedOrigins(input);
  if (invalid.length) throw new OpError(`Not an origin: ${invalid[0]}. Use the scheme and host, like https://example.com`);
  if (origins.length > MAX_EMBED_ORIGINS) throw new OpError(`At most ${MAX_EMBED_ORIGINS} sites`);
  const value = origins.length ? origins.join(" ") : null;
  const set = { origins: value, updatedAt: new Date(), updatedBy: ctx.actor?.id ?? null };
  await ctx.db
    .insert(privateWidget)
    .values({ workspaceId: ctx.workspace.id, ...set })
    .onConflictDoUpdate({ target: privateWidget.workspaceId, set });
  return { origins };
}
