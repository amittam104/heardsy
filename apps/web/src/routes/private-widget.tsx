import { Button } from "@openheard/ui/components/button";
import { cn } from "@openheard/ui/lib/utils";
import { ImageIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getPrivateWidgetConfig } from "@/functions/private-widget";
import { IMAGE_EXTENSIONS, IMAGE_TYPES, MAX_IMAGES, checkImage, tooManyImages } from "@/lib/attachments";
import { PRIVATE_TYPES, PRIVATE_TYPE_LABEL, type PrivateType, privateFieldsSchema } from "@/lib/private-feedback";
import { readPrivateWidgetSettings } from "@/lib/private-widget-settings";

type Search = { workspace: string; host?: string; theme?: "light" | "dark"; accent?: string };

const HEX = /^#[0-9a-f]{3,8}$/i;

// The page the private loader opens in an iframe. It renders only from the
// receiver's own config, keeps the draft in memory for this page view, and
// talks to the host page it was told about, never to anyone else.
export const Route = createFileRoute("/private-widget")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    workspace: typeof s.workspace === "string" ? s.workspace : "",
    host: typeof s.host === "string" ? s.host : undefined,
    theme: s.theme === "light" || s.theme === "dark" ? s.theme : undefined,
    accent: typeof s.accent === "string" && HEX.test(s.accent) ? s.accent : undefined,
  }),
  loaderDeps: ({ search }) => ({ workspace: search.workspace }),
  loader: async ({ deps }) => {
    const config = deps.workspace ? await getPrivateWidgetConfig({ data: { workspace: deps.workspace } }) : null;
    if (!config) throw notFound();
    return config;
  },
  head: ({ loaderData }) => ({ meta: [{ title: loaderData ? `${loaderData.name} · send feedback` : "Send feedback" }, { name: "robots", content: "noindex" }] }),
  component: PrivateWidget,
});

const MSG = {
  ready: "heardsy-private:ready",
  close: "heardsy-private:close",
  busy: "heardsy-private:busy",
  sent: "heardsy-private:sent",
  config: "heardsy-private:config",
  reset: "heardsy-private:reset",
  open: "heardsy-private:open",
} as const;

// The host page's origin, if it is one.
function hostOrigin(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const o = new URL(raw).origin;
    return o === raw && o !== "null" ? o : null;
  } catch {
    return null;
  }
}

type Contact = { name?: string; email?: string } | null;
type Picked = { key: string; file: File; preview: string };
type Draft = { submissionId: string; type: PrivateType; title: string; message: string; name: string; email: string; images: Picked[] };

const freshDraft = (contact: Contact, keep?: Pick<Draft, "name" | "email">): Draft => ({
  submissionId: crypto.randomUUID(),
  type: "bug",
  title: "",
  message: "",
  name: keep?.name ?? contact?.name ?? "",
  email: keep?.email ?? contact?.email ?? "",
  images: [],
});

function PrivateWidget() {
  const config = Route.useLoaderData();
  const search = Route.useSearch();
  const host = useMemo(() => hostOrigin(search.host), [search.host]);
  const [embedded, setEmbedded] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, unknown>>({ theme: search.theme, accent: search.accent });
  const settings = useMemo(() => readPrivateWidgetSettings({ ...config.settings, ...overrides }), [config.settings, overrides]);
  const logo = typeof overrides.logoUrl === "string" ? overrides.logoUrl : overrides.logoUrl === false ? null : config.logoUrl;

  const contactRef = useRef<Contact>(null);
  const [metadata, setMetadata] = useState<unknown>(null);
  const [canSubmit, setCanSubmit] = useState(true);
  // Fields the reporter typed in since the last reset keep their value when
  // the app sends contact details again.
  const edited = useRef({ name: false, email: false });
  const generation = useRef(0);
  const [draft, setDraft] = useState<Draft>(() => freshDraft(null));
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const send = useCallback(
    (msg: Record<string, unknown>) => {
      if (host && window.parent !== window) window.parent.postMessage(msg, host);
    },
    [host],
  );

  const clearImages = (images: Picked[]) => images.forEach((i) => URL.revokeObjectURL(i.preview));

  useEffect(() => {
    setEmbedded(window.parent !== window);
    send({ type: MSG.ready });
  }, [send]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!host || e.source !== window.parent || e.origin !== host) return;
      const m = e.data as { type?: string; contact?: Contact; metadata?: unknown; canSubmit?: boolean; appearance?: Record<string, unknown> } | null;
      if (!m || typeof m !== "object") return;
      if (m.type === MSG.reset) {
        generation.current++;
        send({ type: MSG.busy, busy: false });
        edited.current = { name: false, email: false };
        contactRef.current = null;
        setMetadata(null);
        setCanSubmit(true);
        setError(null);
        setState("idle");
        setDraft((d) => {
          clearImages(d.images);
          return freshDraft(null);
        });
      } else if (m.type === MSG.config) {
        const contact = m.contact && typeof m.contact === "object" ? m.contact : null;
        contactRef.current = contact;
        setMetadata(m.metadata ?? null);
        setCanSubmit(m.canSubmit !== false);
        if (m.appearance && typeof m.appearance === "object") setOverrides(m.appearance);
        setDraft((d) => ({
          ...d,
          name: edited.current.name ? d.name : (contact?.name ?? ""),
          email: edited.current.email ? d.email : (contact?.email ?? ""),
        }));
      } else if (m.type === MSG.open) {
        setTimeout(() => titleRef.current?.focus({ preventScroll: true }), 120);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [host]);

  useEffect(() => {
    const html = document.documentElement;
    html.classList.toggle("dark", settings.theme !== "light");
    html.style.setProperty("--link", settings.accent);
    html.style.setProperty("--ring", settings.accent);
  }, [settings.theme, settings.accent]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && state !== "sending") send({ type: MSG.close });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [send, state]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    if (key === "name") edited.current.name = true;
    if (key === "email") edited.current.email = true;
    setError(null);
    setDraft((d) => ({ ...d, [key]: value }));
  };

  function addFiles(files: File[]) {
    setError(null);
    let room = MAX_IMAGES - draft.images.length;
    const next: Picked[] = [];
    for (const file of files) {
      const problem = checkImage(file);
      if (problem) {
        setError(problem);
        continue;
      }
      if (room <= 0) {
        setError(tooManyImages());
        break;
      }
      room--;
      next.push({ key: crypto.randomUUID(), file, preview: URL.createObjectURL(file) });
    }
    if (next.length) setDraft((d) => ({ ...d, images: [...d.images, ...next] }));
  }

  function removeImage(key: string) {
    setDraft((d) => {
      clearImages(d.images.filter((i) => i.key === key));
      return { ...d, images: d.images.filter((i) => i.key !== key) };
    });
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (state === "sending" || !canSubmit) return;
    const checked = privateFieldsSchema.safeParse(draft);
    if (!checked.success) return setError(checked.error.issues[0]?.message ?? "Check the form.");
    const body = new FormData();
    for (const [k, v] of Object.entries(checked.data)) body.append(k, v);
    if (metadata && typeof metadata === "object") body.append("metadata", JSON.stringify(metadata));
    for (const img of draft.images) body.append("images", img.file, img.file.name || "image");
    setState("sending");
    const sendingGeneration = generation.current;
    setError(null);
    send({ type: MSG.busy, busy: true });
    try {
      const res = await fetch(`/api/private-feedback?workspace=${encodeURIComponent(search.workspace)}`, { method: "POST", body, credentials: "omit" });
      const out = (await res.json().catch(() => null)) as { received?: boolean; error?: string } | null;
      if (generation.current !== sendingGeneration) return;
      if (!res.ok || !out?.received) throw new Error(out?.error ?? "Couldn't send. Try again.");
      send({ type: MSG.sent, submissionId: draft.submissionId });
      clearImages(draft.images);
      edited.current = { name: false, email: false };
      setDraft((d) => freshDraft(contactRef.current, { name: d.name, email: d.email }));
      setState("sent");
    } catch (err) {
      if (generation.current !== sendingGeneration) return;
      setError(err instanceof TypeError ? "Couldn't send. Check your connection and try again." : err instanceof Error ? err.message : "Couldn't send. Try again.");
      setState("idle");
    } finally {
      if (generation.current === sendingGeneration) send({ type: MSG.busy, busy: false });
    }
  }

  const input = "h-9 w-full rounded-lg border border-input bg-card px-3 text-[13px] text-foreground outline-none placeholder:text-faint focus:border-ring/60";
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center gap-2.5 border-b pr-3 pl-4">
        {logo ? (
          <img src={logo} alt="" className="size-[26px] rounded-lg border object-cover" />
        ) : (
          <span aria-hidden className="grid size-[26px] place-items-center rounded-lg border bg-card text-[13px] font-semibold lowercase">
            {config.name.slice(0, 1)}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-[-0.01em]">{settings.heading}</span>
        {embedded ? (
          <button type="button" onClick={() => send({ type: MSG.close })} aria-label="Close" className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <XIcon className="size-4" />
          </button>
        ) : null}
      </header>

      {state === "sent" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-status-shipped text-[#0d0d0f]">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
          <p role="status" className="max-w-[300px] text-[15px] leading-snug font-semibold tracking-[-0.01em]">
            {settings.successMessage}
          </p>
          <Button variant="secondary" onClick={() => setState("idle")}>
            Send another
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
          <fieldset disabled={state === "sending"} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 pt-4 pb-4 scrollbar-thin">
            {settings.helper ? <p className="text-[13px] leading-relaxed text-muted-foreground">{settings.helper}</p> : null}
            <Field label={settings.typeLabel} group>
              <div className="inline-flex h-9 items-center gap-0.5 self-start rounded-lg border bg-card p-0.5" role="radiogroup" aria-label={settings.typeLabel}>
                {PRIVATE_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={draft.type === t}
                    onClick={() => set("type", t)}
                    className={cn("inline-flex h-full items-center rounded-md px-3 text-[13px] transition-colors", draft.type === t ? "bg-secondary font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}
                  >
                    {PRIVATE_TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
            </Field>
            <Field label={settings.titleLabel}>
              <input ref={titleRef} value={draft.title} onChange={(e) => set("title", e.target.value)} maxLength={140} required placeholder={settings.titlePlaceholder} className={input} />
            </Field>
            <Field label={settings.messageLabel}>
              <textarea
                value={draft.message}
                onChange={(e) => set("message", e.target.value)}
                onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && submit()}
                maxLength={5000}
                required
                rows={5}
                placeholder={settings.messagePlaceholder}
                className="w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-[13px]/[1.55] text-foreground outline-none placeholder:text-faint focus:border-ring/60"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={settings.nameLabel}>
                <input value={draft.name} onChange={(e) => set("name", e.target.value)} maxLength={100} required autoComplete="name" placeholder={settings.namePlaceholder} className={input} />
              </Field>
              <Field label={settings.emailLabel}>
                <input type="email" value={draft.email} onChange={(e) => set("email", e.target.value)} maxLength={254} required autoComplete="email" placeholder={settings.emailPlaceholder} className={input} />
              </Field>
            </div>
            <div className="flex flex-col gap-2">
              {draft.images.length ? (
                <ul className="flex flex-wrap gap-2" aria-label="Attached images">
                  {draft.images.map((i) => (
                    <li key={i.key} className="group/draft relative h-14 w-[72px] shrink-0 overflow-hidden rounded-md border border-input bg-secondary">
                      <img src={i.preview} alt={i.file.name} className="size-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeImage(i.key)}
                        aria-label={`Remove ${i.file.name || "image"}`}
                        className="absolute top-1 right-1 inline-flex size-5 items-center justify-center rounded-full bg-background/90 text-muted-foreground ring-1 ring-border hover:text-foreground"
                      >
                        <XIcon className="size-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <button
                type="button"
                disabled={draft.images.length >= MAX_IMAGES}
                onClick={() => fileInput.current?.click()}
                className="inline-flex h-8 items-center gap-1.5 self-start rounded-md px-2 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
              >
                <ImageIcon className="size-4" /> Attach screenshots
                <span className="text-xs text-faint tabular-nums">
                  {draft.images.length}/{MAX_IMAGES}
                </span>
              </button>
              <input
                ref={fileInput}
                type="file"
                hidden
                multiple
                accept={[...IMAGE_TYPES, ...IMAGE_EXTENSIONS].join(",")}
                onChange={(e) => {
                  addFiles(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
            </div>
          </fieldset>

          <footer className="flex shrink-0 flex-col gap-2 border-t px-4 pt-3 pb-4">
            {error ? (
              <p role="alert" className="flex items-start gap-1.5 text-xs leading-[1.45] text-destructive">
                <WarningCircleIcon className="mt-px size-3.5 shrink-0" />
                <span>{error}</span>
              </p>
            ) : null}
            {!canSubmit ? <p className="text-xs text-muted-foreground">Sign in again to send. Your draft is kept.</p> : null}
            <Button type="submit" arrow full disabled={!canSubmit || state === "sending"}>
              {state === "sending" ? "Sending…" : error ? "Retry" : settings.submitLabel}
            </Button>
          </footer>
        </form>
      )}
    </div>
  );
}

// A label around its input; a group of buttons gets a plain heading instead.
function Field({ label, group, children }: { label: string; group?: boolean; children: React.ReactNode }) {
  const Tag = group ? "div" : "label";
  return (
    <Tag className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </Tag>
  );
}
