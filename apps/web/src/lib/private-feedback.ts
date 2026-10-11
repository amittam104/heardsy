import { z } from "zod";

import { MAX_IMAGE_BYTES, MAX_IMAGES } from "./attachments";

// Rules for the Private Feedback Widget shared by the frame, the collector and
// the dashboard. Pure: no server imports.

export const PRIVATE_TYPES = ["bug", "feature"] as const;
export type PrivateType = (typeof PRIVATE_TYPES)[number];
export const PRIVATE_TYPE_LABEL: Record<PrivateType, string> = { bug: "Bug", feature: "Feature request" };

// Every image plus a generous allowance for the text fields and multipart framing.
export const MAX_PRIVATE_BODY = MAX_IMAGES * MAX_IMAGE_BYTES + 1024 * 1024;
export const MAX_METADATA_BYTES = 8 * 1024;
// What one receiving workspace may store in screenshots over a rolling day.
export const DAILY_PRIVATE_BYTES = 500 * 1024 * 1024;

// Server-issued object ids: `pf_` for report images, `pl_` for private logos.
export const PRIVATE_IMAGE_ID = /^pf_[A-Za-z0-9_-]{22}$/;
export const PRIVATE_LOGO_ID = /^pl_[A-Za-z0-9_-]{22}$/;

const SLUG = /^[a-z0-9][a-z0-9-]{0,31}$/;

export const privateFieldsSchema = z.object({
  submissionId: z.string().uuid("Reload the page and try again."),
  type: z.enum(PRIVATE_TYPES, "Pick bug or feature request."),
  title: z.string().trim().min(4, "Give it a title of a few words.").max(140, "Keep the title under 140 characters."),
  message: z.string().trim().min(1, "Tell the team what happened.").max(5000, "Keep the message under 5000 characters."),
  name: z.string().trim().min(1, "Add your name.").max(100, "Keep the name under 100 characters."),
  email: z.string().trim().email("Add a valid email.").max(254, "That email is too long."),
});
export type PrivateFields = z.output<typeof privateFieldsSchema>;

// Keys sorted at every level, so the same object always stores and hashes
// the same way. Built as a string, so no key (not even __proto__) is special.
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

const utf8Bytes = (s: string) => new TextEncoder().encode(s).byteLength;

// The app-supplied context: any JSON object up to 8 KB. Missing, blank or
// empty means none.
export function parseMetadata(raw: string | null | undefined): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw == null || raw.trim() === "") return { ok: true, value: null };
  const tooBig = { ok: false as const, error: "Metadata is limited to 8 KB." };
  if (utf8Bytes(raw) > MAX_METADATA_BYTES) return tooBig;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Metadata must be a JSON object." };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, error: "Metadata must be a JSON object." };
  if (!Object.keys(parsed).length) return { ok: true, value: null };
  const value = canonicalJson(parsed);
  if (utf8Bytes(value) > MAX_METADATA_BYTES) return tooBig;
  return { ok: true, value };
}

// Which workspace an explicit `workspace=` parameter may reach on this host.
// In production only the workspace the host itself serves, never a marketing
// host. Local dev has one origin for every workspace, so any valid slug.
export function receiverDecision(input: { param: string | null | undefined; hostSlug: string; marketing: boolean; local: boolean }): "ok" | "reject" {
  const { param, hostSlug, marketing, local } = input;
  if (!param || !SLUG.test(param)) return "reject";
  if (local) return "ok";
  if (marketing || param !== hostSlug) return "reject";
  return "ok";
}

// The dashboard link in team emails. Production links already sit on the
// receiver's own host; local dev names the workspace with ?ws=.
export function privateReportUrl(origin: string, workspaceId: string, id: string, local: boolean): string {
  const url = `${origin}/dashboard/private/${id}`;
  return local && workspaceId !== "default" ? `${url}?ws=${encodeURIComponent(workspaceId)}` : url;
}

export const privateImagePath = (reportId: string, imageId: string) => `/api/private-feedback/${reportId}/images/${imageId}`;
export const privateLogoPath = (workspaceId: string, logoId: string) => `/private-widget/logo/${workspaceId}/${logoId}`;

async function sha256Hex(data: BufferSource | string): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Fingerprint of what was submitted, so a retry with the same submission id
// can be told apart from a different report reusing it.
export async function contentHash(fields: PrivateFields, metadata: string | null, images: { contentType: string; bytes: Uint8Array }[]): Promise<string> {
  const imageHashes = await Promise.all(images.map(async (i) => [i.contentType, await sha256Hex(i.bytes as Uint8Array<ArrayBuffer>)]));
  return sha256Hex(JSON.stringify([fields.type, fields.title, fields.message, fields.name, fields.email, metadata, imageHashes]));
}
