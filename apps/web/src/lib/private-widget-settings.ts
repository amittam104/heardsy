import { z } from "zod";

import { DEFAULT_ACCENT, WIDGET_LABEL_MAX, WIDGET_LAUNCHERS, WIDGET_POSITIONS, WIDGET_THEMES } from "./widget-settings";

// How the Private Feedback Widget looks and what it says, saved per workspace
// in private_widget.settings and independent of the public widget. The
// loader reads it from /private-widget.json; data-* attributes and runtime
// appearance still win. Wording never removes a field: every field stays.

export const PRIVATE_WIDGET_SIZES = { small: { width: 360, height: 560 }, medium: { width: 420, height: 640 }, large: { width: 520, height: 720 } } as const;
export type PrivateWidgetSize = keyof typeof PRIVATE_WIDGET_SIZES;
const SIZES = Object.keys(PRIVATE_WIDGET_SIZES) as [PrivateWidgetSize, ...PrivateWidgetSize[]];

const words = (max: number, what: string) => z.string().trim().min(1, `${what} needs some text`).max(max, `${what} is at most ${max} characters`);

export const privateWidgetSettingsSchema = z.object({
  theme: z.enum(WIDGET_THEMES),
  accent: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Accent must be a hex colour like #6e8bff")
    .transform((s) => s.toLowerCase()),
  launcher: z.enum(WIDGET_LAUNCHERS),
  launcherLabel: words(WIDGET_LABEL_MAX, "The launcher label"),
  position: z.enum(WIDGET_POSITIONS),
  size: z.enum(SIZES),
  heading: words(60, "The heading"),
  helper: z.string().trim().max(200, "The helper text is at most 200 characters"),
  typeLabel: words(40, "The type label"),
  titleLabel: words(40, "The title label"),
  titlePlaceholder: z.string().trim().max(80),
  messageLabel: words(40, "The message label"),
  messagePlaceholder: z.string().trim().max(80),
  nameLabel: words(40, "The name label"),
  namePlaceholder: z.string().trim().max(80),
  emailLabel: words(40, "The email label"),
  emailPlaceholder: z.string().trim().max(80),
  submitLabel: words(24, "The send button"),
  successMessage: words(200, "The success message"),
});

export type PrivateWidgetSettings = z.output<typeof privateWidgetSettingsSchema>;

export const DEFAULT_PRIVATE_WIDGET_SETTINGS: PrivateWidgetSettings = {
  theme: "dark",
  accent: DEFAULT_ACCENT,
  launcher: "icon",
  launcherLabel: "Feedback",
  position: "bottom-right",
  size: "medium",
  heading: "Send feedback",
  helper: "Report a bug or ask for a feature. Only the team reads it.",
  typeLabel: "Type",
  titleLabel: "Title",
  titlePlaceholder: "A short summary",
  messageLabel: "Details",
  messagePlaceholder: "What happened, or what would help?",
  nameLabel: "Name",
  namePlaceholder: "Your name",
  emailLabel: "Email",
  emailPlaceholder: "you@example.com",
  submitLabel: "Send",
  successMessage: "Thanks. The team has your report.",
};

// Field by field: a bad or missing value falls back to its default.
export function readPrivateWidgetSettings(stored: unknown): PrivateWidgetSettings {
  const raw = stored && typeof stored === "object" ? (stored as Record<string, unknown>) : {};
  const shape = privateWidgetSettingsSchema.shape;
  const out = { ...DEFAULT_PRIVATE_WIDGET_SETTINGS } as Record<string, unknown>;
  for (const key of Object.keys(shape) as (keyof typeof shape)[]) {
    if (!(key in raw)) continue;
    const parsed = shape[key].safeParse(raw[key]);
    if (parsed.success) out[key] = parsed.data;
  }
  return out as PrivateWidgetSettings;
}

// The public body of /private-widget.json: appearance and name only.
export type PrivateWidgetConfig = { name: string; logoUrl: string | null; settings: PrivateWidgetSettings };
