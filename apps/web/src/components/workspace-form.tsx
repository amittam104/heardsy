import { CheckCircleIcon, GlobeSimpleIcon, LinkSimpleIcon, MonitorIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useId, useState } from "react";

import { Button } from "@openheard/ui/components/button";

// The one workspace form. "create" asks for a subdomain and makes a new
// workspace; "setup" fills in an existing one (first run on a self-hosted
// install) and has no subdomain.
export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);

const HEARD_OPTIONS = ["Twitter / X", "Product Hunt", "GitHub", "Blog post", "Search engine", "Friend or colleague", "Other"];

export type WorkspaceFormValues = { name: string; slug: string; website: string; heardAboutUs: string };

export function WorkspaceForm({
  mode,
  domainSuffix,
  initialName = "",
  initialWebsite = "",
  initialSlug = "",
  showHeardAbout = true,
  onSubmit,
}: {
  mode: "create" | "setup";
  domainSuffix: string;
  initialName?: string;
  initialWebsite?: string;
  initialSlug?: string;
  showHeardAbout?: boolean;
  onSubmit: (values: WorkspaceFormValues) => Promise<void>;
}) {
  const [website, setWebsite] = useState(initialWebsite);
  const [name, setName] = useState(initialName);
  const [slug, setSlug] = useState(initialSlug);
  const [slugTouched, setSlugTouched] = useState(!!initialSlug);
  const [slugBlurred, setSlugBlurred] = useState(false);
  const [heardAboutUs, setHeardAboutUs] = useState("");
  const [busy, setBusy] = useState(false);
  const id = useId();

  const finalSlug = slugTouched ? slugify(slug) : slugify(name);
  const normalizedWebsite = website.trim() ? (/^https?:\/\//i.test(website.trim()) ? website.trim() : "https://" + website.trim()) : "";
  const websiteValid = /^https?:\/\/[^\s.]+\.[^\s]+$/.test(normalizedWebsite);
  const nameValid = name.trim().length >= 2;
  const slugTooShort = finalSlug.length > 0 && finalSlug.length < 5;
  const slugValid = mode === "setup" || finalSlug.length >= 5;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "create" && slugTooShort) return;
    setBusy(true);
    try {
      await onSubmit({ name: name.trim(), slug: finalSlug, website: normalizedWebsite, heardAboutUs });
    } finally {
      setBusy(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      (e.target as HTMLElement).closest("form")?.requestSubmit();
    }
  }

  return (
    <form onSubmit={submit} onKeyDown={handleKeyDown} className="flex w-full max-w-[480px] flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Create your workspace</h1>
        <p className="text-sm text-muted-foreground">Set up a space to collect feedback, plan your roadmap, and share updates.</p>
      </div>

      <div className="flex flex-col gap-5">
        <Field id={`${id}-website`} label="Website" optional>
          <div className="flex items-center gap-2.5">
            <FieldBox icon={<GlobeSimpleIcon aria-hidden className="size-[15px]" />}>
              <input id={`${id}-website`} name="website" type="text" inputMode="url" autoComplete="url" spellCheck={false} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="example.com" data-focus="parent" className={INPUT} />
            </FieldBox>
            {websiteValid ? <CheckCircleIcon aria-hidden weight="fill" className="size-5 shrink-0 text-emerald-500" /> : null}
          </div>
        </Field>

        <Field id={`${id}-name`} label="Workspace name">
          <div className="flex items-center gap-2.5">
            <FieldBox icon={<MonitorIcon aria-hidden className="size-[15px]" />}>
              <input id={`${id}-name`} name="name" autoComplete="organization" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={60} placeholder="Acme" data-focus="parent" className={INPUT} />
            </FieldBox>
            {nameValid ? <CheckCircleIcon aria-hidden weight="fill" className="size-5 shrink-0 text-emerald-500" /> : null}
          </div>
        </Field>

        {mode === "create" ? (
          <Field id={`${id}-slug`} label="Subdomain">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2.5">
                <FieldBox icon={<LinkSimpleIcon aria-hidden className="size-[15px]" />}>
                  <input
                    id={`${id}-slug`}
                    name="slug"
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={slugTooShort && slugBlurred ? true : undefined}
                    aria-describedby={slugTooShort && slugBlurred ? `${id}-slug-error` : undefined}
                    value={slugTouched ? slug : finalSlug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      setSlug(e.target.value);
                    }}
                    onBlur={() => setSlugBlurred(true)}
                    placeholder="acme"
                    data-focus="parent" className={INPUT}
                  />
                  <span className="shrink-0 text-sm text-faint">.{domainSuffix}</span>
                </FieldBox>
                {slugValid && finalSlug ? <CheckCircleIcon aria-hidden weight="fill" className="size-5 shrink-0 text-emerald-500" /> : slugTooShort && slugBlurred ? <WarningCircleIcon aria-hidden weight="fill" className="size-5 shrink-0 text-destructive" /> : null}
              </div>
              {slugTooShort && slugBlurred ? (
                <p id={`${id}-slug-error`} className="text-[13px] text-destructive">
                  Use at least 5 letters or numbers.
                </p>
              ) : null}
            </div>
          </Field>
        ) : null}

        {showHeardAbout ? (
          <Field id={`${id}-source`} label="Where did you hear about us?" optional>
            <select id={`${id}-source`} name="heardAboutUs" value={heardAboutUs} onChange={(e) => setHeardAboutUs(e.target.value)} className="h-10 w-full appearance-none rounded-lg border border-input bg-card px-3 text-base text-foreground focus:border-ring/60 sm:text-sm [&:not(:valid)]:text-faint">
              <option value="">Select an option</option>
              {HEARD_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" disabled={busy || !nameValid || !slugValid}>
          {busy ? "Creating…" : "Create workspace"}
          <kbd className="ml-2 inline-flex items-center gap-0.5 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[11px] text-faint">⌘↵</kbd>
        </Button>
      </div>
    </form>
  );
}

const INPUT = "min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-faint sm:text-sm";

function Field({ id, label, optional, children }: { id: string; label: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {optional ? <span className="ml-2 text-xs font-normal text-faint">(optional)</span> : null}
      </label>
      {children}
    </div>
  );
}

function FieldBox({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return <div className="flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-input bg-card px-3 text-faint transition-colors focus-within:border-ring has-[[data-focus=parent]:focus-visible]:outline-2 has-[[data-focus=parent]:focus-visible]:outline-offset-2 has-[[data-focus=parent]:focus-visible]:outline-ring">{icon}{children}</div>;
}
