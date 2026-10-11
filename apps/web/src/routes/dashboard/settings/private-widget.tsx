import { Button } from "@openheard/ui/components/button";
import { Textarea } from "@openheard/ui/components/textarea";
import { cn } from "@openheard/ui/lib/utils";
import { CheckIcon, CircleHalfIcon, CopyIcon, ImageIcon, MoonIcon, SunIcon } from "@phosphor-icons/react";
import { createFileRoute, useLoaderData, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Row, SectionHead } from "@/components/admin/panel";
import { getPrivateWidgetSettings, savePrivateWidgetOrigins, savePrivateWidgetSettings } from "@/functions/private-widget";
import { checkImage } from "@/lib/attachments";
import { isDemo } from "@/lib/demo";
import { DEFAULT_PRIVATE_WIDGET_SETTINGS, type PrivateWidgetSettings } from "@/lib/private-widget-settings";
import { DEFAULT_ACCENT, WIDGET_LABEL_MAX } from "@/lib/widget-settings";
import { parseEmbedOrigins } from "@/lib/widget-origins";
import { workspaceUrl } from "@/lib/workspace-url";
import { PageHead } from "@/routes/dashboard/settings";
import { Segmented } from "@/routes/dashboard/settings/widget";

export const Route = createFileRoute("/dashboard/settings/private-widget")({
  loader: () => getPrivateWidgetSettings(),
  head: () => ({ meta: [{ title: "Private widget · settings" }] }),
  component: PrivateWidgetPage,
});

type Page = "install" | "appearance" | "wording";
const PAGES: [Page, string][] = [
  ["install", "Install"],
  ["appearance", "Appearance"],
  ["wording", "Wording"],
];

function PrivateWidgetPage() {
  const saved = Route.useLoaderData();
  const root = useLoaderData({ from: "__root__" });
  const router = useRouter();
  const ws = root.workspace;
  const admin = root.user?.role === "admin";
  const locked = isDemo(ws);
  const [page, setPage] = useState<Page>("install");
  const [draft, setDraft] = useState<PrivateWidgetSettings>(saved.settings);
  // undefined keeps the saved logo, null removes it, a string is a new upload.
  const [logoId, setLogoId] = useState<string | null | undefined>(undefined);
  const [logoPreview, setLogoPreview] = useState<string | null>(saved.logoUrl);
  useEffect(() => () => void (logoPreview?.startsWith("blob:") && URL.revokeObjectURL(logoPreview)), [logoPreview]);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved.settings) || logoId !== undefined;
  // The private widget is served from the receiving workspace's own host.
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    const url = root.rootDomain ? workspaceUrl(ws.id, root.rootDomain, "/") : "/";
    setOrigin(url.startsWith("/") ? window.location.origin : new URL(url).origin);
  }, [ws.id, root.rootDomain]);

  const set = <K extends keyof PrivateWidgetSettings>(key: K, value: PrivateWidgetSettings[K]) => setDraft((d) => ({ ...d, [key]: value }));

  async function save() {
    setSaving(true);
    try {
      const next = await savePrivateWidgetSettings({ data: { settings: draft, logoId } });
      setDraft(next.settings);
      setLogoId(undefined);
      setLogoPreview(next.logoUrl);
      await router.invalidate();
      toast.success("Saved. Sites with the snippet pick it up within a minute.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function uploadLogo(file: File) {
    const problem = checkImage(file);
    if (problem) return toast.error(problem);
    const res = await fetch("/api/private-widget/logo", { method: "POST", body: file, headers: { "content-type": file.type } }).catch(() => null);
    if (!res) return toast.error("Upload failed. Check your connection and try again.");
    const out = (await res.json().catch(() => null)) as { logoId?: string; error?: string } | null;
    if (!res.ok || !out?.logoId) return toast.error(out?.error ?? "Upload failed. Try again.");
    setLogoId(out.logoId);
    setLogoPreview(URL.createObjectURL(file));
  }

  return (
    <>
      <PageHead title="Private widget" sub="Let people in your app report bugs and ask for features. Only admins and teammates with private feedback access read what they send." />
      <nav className="-mt-2 mb-6 flex gap-1 border-b" aria-label="Private widget settings">
        {PAGES.map(([p, label]) => (
          <button
            key={p}
            type="button"
            onClick={() => setPage(p)}
            aria-current={page === p ? "page" : undefined}
            className={cn("relative -mb-px h-9 border-b px-3 text-[13px] transition-colors", page === p ? "border-foreground font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {label}
          </button>
        ))}
      </nav>

      {page === "install" ? (
        <Install origin={origin} workspaceId={ws.id} />
      ) : null}
      {page === "install" ? <AllowedSites current={saved.origins} editable={admin && !locked} /> : null}

      {page !== "install" ? (
        <div className="@container">
          <div className="grid items-start gap-8 @min-[1000px]:grid-cols-[minmax(0,1fr)_440px]">
            <div className="min-w-0">
              {page === "appearance" ? (
                <Appearance draft={draft} set={set} logo={logoPreview} onLogo={uploadLogo} onRemoveLogo={() => (setLogoId(null), setLogoPreview(null))} />
              ) : (
                <Wording draft={draft} set={set} />
              )}
              <div className="flex items-center justify-end gap-3 border-t pt-4">
                <span className="text-xs text-faint">{locked ? "The demo's private widget stays as it is" : dirty ? "Unsaved changes" : "Saved"}</span>
                {dirty ? (
                  <Button size="sm" variant="secondary" onClick={() => (setDraft(saved.settings), setLogoId(undefined), setLogoPreview(saved.logoUrl))} disabled={saving}>
                    Discard
                  </Button>
                ) : null}
                <Button arrow size="sm" disabled={!dirty || saving || locked} onClick={save}>
                  Save
                </Button>
              </div>
            </div>
            <Preview origin={origin} workspaceId={ws.id} settings={draft} logoUrl={logoPreview} />
          </div>
        </div>
      ) : null}
    </>
  );
}

function Install({ origin, workspaceId }: { origin: string; workspaceId: string }) {
  const [copied, setCopied] = useState(false);
  const snippet = `<script src="${origin}/private-widget.js" data-workspace="${workspaceId}" async></script>`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Could not copy. Select the snippet and copy it by hand.");
    }
  }
  return (
    <>
      <SectionHead title="Snippet" />
      <div className="mb-8 flex flex-col gap-2.5 border-t pt-4">
        <p className="text-[13px] text-muted-foreground">
          Paste this on the pages of your app where people should be able to send feedback. Nobody signs in to Heardsy: your app decides who may send, and can fill in their name and email.
        </p>
        <div className="flex items-start gap-2 rounded-lg border bg-card p-1.5 pl-3.5">
          <code className="min-w-0 flex-1 py-1.5 font-mono text-[12px]/5 break-all text-foreground">{snippet}</code>
          <Button size="sm" variant="secondary" onClick={copy} aria-label="Copy snippet">
            {copied ? <CheckIcon weight="bold" className="size-3 text-status-shipped" /> : <CopyIcon className="size-3" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>
      <SectionHead title="Tell it who is signed in" />
      <div className="mb-8 flex flex-col gap-2.5 border-t pt-4 text-[13px] text-muted-foreground">
        <p>
          Prefill the reporter and attach your own context with <code className="font-mono text-[12px] text-foreground">heardsyPrivate("config", ...)</code>. Call <code className="font-mono text-[12px] text-foreground">heardsyPrivate("reset")</code> on sign out or when someone else signs in.
        </p>
        <code className="rounded-md bg-card px-2.5 py-1.5 font-mono text-[12px] whitespace-pre-wrap text-foreground">{`heardsyPrivate("config", { contact: { name: user.name, email: user.email }, metadata: { plan: "pro" } });`}</code>
        <p>
          Any element with <code className="font-mono text-[12px] text-foreground">data-heardsy-private-open</code> opens it. The full guide is in docs/private-widget.md.
        </p>
      </div>
    </>
  );
}

const SWATCHES = [DEFAULT_ACCENT, "#e5484d", "#f2a93b", "#3ecf8e", "#ededf0"];
type SetFn = <K extends keyof PrivateWidgetSettings>(key: K, value: PrivateWidgetSettings[K]) => void;

function Appearance({ draft, set, logo, onLogo, onRemoveLogo }: { draft: PrivateWidgetSettings; set: SetFn; logo: string | null; onLogo: (f: File) => void; onRemoveLogo: () => void }) {
  const [hex, setHex] = useState(draft.accent);
  useEffect(() => setHex(draft.accent), [draft.accent]);
  const file = useRef<HTMLInputElement>(null);
  return (
    <>
      <Row label="Logo" help="Shown at the top of the form. PNG, JPEG, GIF or WebP up to 5 MB.">
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center overflow-hidden rounded-lg border bg-card">{logo ? <img src={logo} alt="" className="size-full object-cover" /> : <ImageIcon className="size-4 text-faint" />}</span>
          <Button size="sm" variant="secondary" onClick={() => file.current?.click()}>
            {logo ? "Replace" : "Upload"}
          </Button>
          {logo ? (
            <Button size="sm" variant="secondary" onClick={onRemoveLogo}>
              Remove
            </Button>
          ) : null}
          <input
            ref={file}
            type="file"
            hidden
            accept="image/png,image/jpeg,image/gif,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onLogo(f);
              e.target.value = "";
            }}
          />
        </div>
      </Row>
      <Row label="Theme" help="Auto follows the visitor's system setting.">
        <Segmented
          value={draft.theme}
          onChange={(v) => set("theme", v)}
          options={[
            ["dark", "Dark", MoonIcon],
            ["light", "Light", SunIcon],
            ["auto", "Auto", CircleHalfIcon],
          ]}
        />
      </Row>
      <Row label="Accent" help="Launcher, focus rings and links.">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex flex-wrap gap-1.5">
            {SWATCHES.map((c) => (
              <button key={c} type="button" onClick={() => set("accent", c)} aria-label={c} aria-pressed={draft.accent === c} className={cn("size-[22px] rounded-full", draft.accent === c && "ring-2 ring-foreground ring-offset-2 ring-offset-background")} style={{ background: c }} />
            ))}
          </span>
          <input
            value={hex}
            onChange={(e) => {
              setHex(e.target.value);
              const v = e.target.value.trim().toLowerCase();
              if (/^#[0-9a-f]{6}$/.test(v)) set("accent", v);
            }}
            aria-label="Accent colour"
            aria-invalid={!/^#[0-9a-f]{6}$/i.test(hex.trim()) || undefined}
            className="h-8 w-24 rounded-lg border border-input bg-card px-2.5 text-[12px] tabular-nums outline-none focus:border-ring/60 aria-invalid:border-destructive"
          />
        </div>
      </Row>
      <Row label="Launcher" help="Hidden if your app opens it from its own button.">
        <Segmented
          value={draft.launcher}
          onChange={(v) => set("launcher", v)}
          options={[
            ["icon", "Icon"],
            ["label", "Icon + label"],
            ["hidden", "Hidden"],
          ]}
        />
      </Row>
      <Row label="Launcher label" help="Shown with Icon + label, and read out to screen readers.">
        <input
          value={draft.launcherLabel}
          maxLength={WIDGET_LABEL_MAX}
          onChange={(e) => set("launcherLabel", e.target.value)}
          onBlur={() => !draft.launcherLabel.trim() && set("launcherLabel", DEFAULT_PRIVATE_WIDGET_SETTINGS.launcherLabel)}
          aria-label="Launcher label"
          className="h-8 w-40 rounded-lg border border-input bg-card px-2.5 text-[13px] outline-none focus:border-ring/60"
        />
      </Row>
      <Row label="Position" help="Which corner it sits in. Pick the other corner if the public widget is on the same page.">
        <Segmented
          value={draft.position}
          onChange={(v) => set("position", v)}
          options={[
            ["bottom-right", "Bottom right"],
            ["bottom-left", "Bottom left"],
          ]}
        />
      </Row>
      <Row label="Size" help="Small 360, Medium 420, Large 520 pixels wide. Phones always get the full screen.">
        <Segmented
          value={draft.size}
          onChange={(v) => set("size", v)}
          options={[
            ["small", "Small"],
            ["medium", "Medium"],
            ["large", "Large"],
          ]}
        />
      </Row>
    </>
  );
}

const WORDING: [keyof PrivateWidgetSettings, string, number][] = [
  ["heading", "Heading", 60],
  ["helper", "Helper text", 200],
  ["typeLabel", "Type label", 40],
  ["titleLabel", "Title label", 40],
  ["titlePlaceholder", "Title placeholder", 80],
  ["messageLabel", "Message label", 40],
  ["messagePlaceholder", "Message placeholder", 80],
  ["nameLabel", "Name label", 40],
  ["namePlaceholder", "Name placeholder", 80],
  ["emailLabel", "Email label", 40],
  ["emailPlaceholder", "Email placeholder", 80],
  ["submitLabel", "Send button", 24],
  ["successMessage", "After sending", 200],
];

function Wording({ draft, set }: { draft: PrivateWidgetSettings; set: SetFn }) {
  return (
    <>
      <p className="pb-3 text-[13px] text-muted-foreground">Every field stays on the form and stays required; this only changes what it says.</p>
      {WORDING.map(([key, label, max]) => (
        <Row key={key} label={label}>
          <input
            value={draft[key] as string}
            maxLength={max}
            onChange={(e) => set(key, e.target.value as never)}
            onBlur={() => {
              const optional = key === "helper" || key.endsWith("Placeholder");
              if (!optional && !(draft[key] as string).trim()) set(key, DEFAULT_PRIVATE_WIDGET_SETTINGS[key] as never);
            }}
            aria-label={label}
            className="h-8 w-[280px] max-w-full rounded-lg border border-input bg-card px-2.5 text-[13px] outline-none focus:border-ring/60"
          />
        </Row>
      ))}
    </>
  );
}

// Which sites may embed the private widget. Unlike the public widget, none
// listed means none: only this dashboard's preview can show it.
function AllowedSites({ current, editable }: { current: string | null; editable: boolean }) {
  const router = useRouter();
  const saved = (current ?? "").split(" ").filter(Boolean).join("\n");
  const [value, setValue] = useState(saved);
  const [saving, setSaving] = useState(false);
  const { invalid } = parseEmbedOrigins(value);

  async function save() {
    setSaving(true);
    try {
      const { origins } = await savePrivateWidgetOrigins({ data: { origins: value } });
      setValue(origins.join("\n"));
      await router.invalidate();
      toast.success(origins.length ? "Those sites can embed the private widget now" : "No site can embed the private widget now");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <SectionHead title="Allowed sites" />
      <div className="flex flex-col gap-2.5 border-t pt-4">
        <p className="text-[13px] text-muted-foreground">
          The sites that may show the private widget, one origin per line, like <code className="font-mono text-[12px] text-foreground">https://app.example.com</code>. Until you add one, no site can embed it.
        </p>
        <Textarea value={value} onChange={(e) => setValue(e.target.value)} disabled={!editable} placeholder="No sites yet" spellCheck={false} aria-invalid={invalid.length > 0 || undefined} className="text-[12px]" />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-faint">{!editable ? "Only admins change this list." : invalid.length ? `Not an origin: ${invalid[0]}` : ""}</span>
          {editable ? (
            <Button size="sm" variant="secondary" onClick={save} disabled={saving || invalid.length > 0 || value === saved}>
              Save
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// A stand-in host page running the real private loader for this workspace.
// Unsaved changes reach it through heardsyPrivate("config"), so it never reloads.
function Preview({ origin, workspaceId, settings, logoUrl }: { origin: string; workspaceId: string; settings: PrivateWidgetSettings; logoUrl: string | null }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const config = useMemo(() => ({ appearance: { ...settings, logoUrl: logoUrl ?? false } }), [settings, logoUrl]);
  const first = useRef(config);
  useEffect(() => {
    const w = frame.current?.contentWindow as (Window & { heardsyPrivate?: (cmd: string, arg: unknown) => void }) | null | undefined;
    w?.heardsyPrivate?.("config", config);
  }, [config]);
  const head = (
    <div className="flex items-center justify-between pb-2 text-xs">
      <span className="font-semibold text-muted-foreground">Preview</span>
      <span className="text-faint">
        {settings.theme} · {settings.size}
      </span>
    </div>
  );
  if (!origin) return <div>{head}<div className="h-[720px] rounded-xl border bg-card" /></div>;
  const line = (w: number) => `<div style="height:10px;width:${w}%;border-radius:5px;background:#e6e4de;margin:0 0 12px"></div>`;
  const json = (v: unknown) => JSON.stringify(v).replace(/</g, "\u003c");
  const doc = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font:14px system-ui,sans-serif;background:#f7f5f0}header{height:48px;border-bottom:1px solid #e6e4de;display:flex;align-items:center;padding:0 20px}main{padding:28px 20px}</style></head><body><header>${line(12).replace("margin:0 0 12px", "margin:0")}</header><main>${line(60)}${line(90)}${line(80)}</main><script>window.heardsyPrivate=function(){(window.heardsyPrivate.q=window.heardsyPrivate.q||[]).push(arguments)};window.heardsyPrivate("config",${json(first.current)})</script><script src="${origin}/private-widget.js" data-workspace="${workspaceId.replace(/[^a-z0-9-]/g, "")}" data-preview="true" data-open-on-load async></script></body></html>`;
  return (
    <div className="@min-[1000px]:sticky @min-[1000px]:top-0">
      {head}
      <div className="overflow-hidden rounded-xl border">
        <iframe ref={frame} title="Private widget preview" srcDoc={doc} className="block h-[720px] w-full bg-[#f7f5f0]" />
      </div>
      <p className="pt-2 text-xs text-faint">Live, against this workspace. Reports sent from the preview are real.</p>
    </div>
  );
}
