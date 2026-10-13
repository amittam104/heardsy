import { ListIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useLoaderData, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useRef, useState } from "react";

import { Kbd } from "@/components/bits";
import { ThemeSwitch } from "@/components/theme-switch";
import { DASHBOARD_THEME_KEY } from "@/lib/visitor-theme";
import { cn } from "@openheard/ui/lib/utils";

// Opens the navigation sheet on small screens; provided by the dashboard layout.
export const OpenNav = createContext<((trigger: HTMLElement) => void) | null>(null);

// The rounded content panel every admin page lives in, with its top bar.
// `heading={false}` keeps the title out of the outline when the page has its own h1.
export function Panel({
  title,
  children,
  className,
  actions,
  aside,
  onSearch,
  query,
  searchLabel = "Search posts",
  heading = true,
}: {
  title: ReactNode;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
  aside?: ReactNode;
  onSearch?: (q: string) => void;
  query?: string;
  searchLabel?: string;
  heading?: boolean;
}) {
  const root = useLoaderData({ from: "__root__" });
  const navigate = useNavigate();
  const openNav = useContext(OpenNav);
  const search = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const q = query ?? draft;
  const setQ = (v: string) => {
    setDraft(v);
    onSearch?.(v);
  };
  // Without a list of its own to filter, the box searches the public board.
  const searchable = !!onSearch || root.user?.role === "admin";
  const label = onSearch ? searchLabel : "Search the public board";
  const Title = heading && typeof title === "string" ? "h1" : "div";
  useEffect(() => {
    if (!searchable) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchable]);
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col md:py-3 md:pr-3">
      <div className="flex min-h-0 flex-1 overflow-hidden bg-background md:rounded-xl md:border">
        {aside}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex min-h-[52px] shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b py-2 pr-3 pl-2 md:pr-4 md:pl-5">
            {openNav ? (
              <button
                type="button"
                onClick={(e) => openNav(e.currentTarget)}
                aria-label="Open navigation"
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground md:hidden"
              >
                <ListIcon aria-hidden className="size-5" />
              </button>
            ) : null}
            <Title className="min-w-0 flex-1 truncate pl-1 text-[17px] font-semibold tracking-[-0.01em] md:pl-0">{title}</Title>
            {searchable ? (
              <form
                role="search"
                aria-label={label}
                className="relative order-last basis-full px-1 md:order-none md:basis-auto md:px-0"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!onSearch) navigate({ to: root.boardPath, search: q ? { q } : {} });
                }}
              >
                <MagnifyingGlassIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-[13px] -translate-y-1/2 text-muted-foreground md:left-2.5" />
                <input
                  ref={search}
                  data-admin-search
                  type="search"
                  name="q"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setQ("");
                      e.currentTarget.blur();
                    }
                  }}
                  placeholder={label}
                  aria-label={label}
                  className="h-10 w-full rounded-lg border bg-card pr-3 pl-8 text-base outline-none placeholder:text-muted-foreground focus:border-ring/60 md:h-8 md:w-[220px] md:pr-10 md:pl-7 md:text-[13px] [&::-webkit-search-cancel-button]:hidden"
                />
                <Kbd className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 md:inline-flex">⌘K</Kbd>
              </form>
            ) : null}
            <div className="flex max-w-full flex-wrap items-center justify-end gap-2">
              {actions}
              <ThemeSwitch storageKey={DASHBOARD_THEME_KEY} fallback="dark" />
            </div>
          </header>
          <div key={typeof title === "string" ? title : undefined} className={cn("min-h-0 flex-1 overflow-auto scrollbar-thin motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150", className)}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SectionHead({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between pb-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      {right}
    </div>
  );
}

// Settings row: label and description left, control right, hairline above.
// The label keeps about 200px; when the control does not fit beside it, the
// control drops onto its own line instead of squeezing the label.
export function Row({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2.5 border-t py-3.5">
      <div className="flex min-w-[180px] flex-[1_1_200px] flex-col gap-0.5">
        <div className="text-[13px] font-semibold">{label}</div>
        {help ? <div className="text-xs text-faint">{help}</div> : null}
      </div>
      <div className="max-w-full min-w-0">{children}</div>
    </div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn("relative inline-flex h-5 w-[34px] shrink-0 items-center rounded-full border p-0.5 outline-none transition-colors", on ? "border-link bg-link" : "border-input bg-secondary")}
    >
      <span className={cn("size-3.5 rounded-full transition-transform motion-reduce:transition-none", on ? "translate-x-[14px] bg-[#0d0d0f]" : "translate-x-0 bg-muted-foreground")} />
    </button>
  );
}
