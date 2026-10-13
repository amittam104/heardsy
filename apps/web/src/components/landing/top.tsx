import { ListIcon, XIcon } from "@phosphor-icons/react";
import { Link, useLoaderData } from "@tanstack/react-router";
import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@openheard/ui/components/button";
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@openheard/ui/components/dialog";
import { cn } from "@openheard/ui/lib/utils";
import { DEMO_WORKSPACE_ID } from "@/lib/demo";
import { signedInHome, workspaceUrl } from "@/lib/workspace-url";
import Logo from "../logo";
import { BlurFade } from "./magic/blur-fade";
import { AnimatedSpan, Terminal, TypingAnimation } from "./magic/terminal";
import { Framed, SectionHeader } from "./shared";

export const GITHUB = "https://github.com/amittam104/heardsy";

const links = [
  { href: "#product", label: "Product" },
  { href: "#agents", label: "Agents" },
  { href: "#own", label: "Self-host" },
  { href: "#pricing", label: "Pricing" },
  { href: GITHUB, label: "GitHub" },
];

type Cta = { href: string; label: string };

// `start` is the way in for someone new: a cloud workspace, or this
// install's board. `account` is set once signed in: the dashboard for people
// who run a workspace, the board for everyone else.
export function useLandingCtas(): { start: Cta; account: Cta | null } {
  const root = useLoaderData({ from: "__root__" });
  const own = (root as { ownWorkspaces?: { id: string; name: string }[] }).ownWorkspaces ?? [];
  const start = root.rootDomain ? { href: "/start", label: "Start for free" } : { href: root.boardPath, label: "Open feedback board" };
  if (!root.user) return { start, account: null };
  if (root.marketing) {
    const latest = own[own.length - 1];
    return { start, account: latest ? { href: workspaceUrl(latest.id, root.rootDomain, "/dashboard"), label: "Go to dashboard" } : { href: "/new", label: "Create a workspace" } };
  }
  if (root.localDashboard) return { start, account: { href: root.localDashboard, label: "Go to dashboard" } };
  if (root.user.role === "admin" || root.user.privateAccess) return { start, account: { href: signedInHome(root.user, root.workspace.name, root.boardPath), label: "Go to dashboard" } };
  return { start, account: { href: root.boardPath, label: "Open feedback board" } };
}

// Render target for a CTA Button: a router link in-app, a plain anchor off-site.
export function ctaLink(href: string) {
  return href.startsWith("/") && !href.includes("ws=") ? <Link to={href} /> : <a href={href} />;
}

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const reduce = useReducedMotion();
  const { start, account } = useLandingCtas();
  const pendingSection = useRef<string | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const primary = account ?? start;

  return (
    <header className={cn("sticky top-0 z-50 border-b transition-colors duration-200", scrolled ? "border-border bg-background" : "border-transparent")}>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 md:px-10">
        <Link to="/" className="flex shrink-0 items-center gap-2.5 rounded-md text-[15px] font-semibold tracking-[-0.01em] text-foreground">
          <Logo size={22} />
          Heardsy
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {links.map((n) => (
            <a key={n.label} href={n.href} className="rounded-md px-3 py-1.5 text-[14px] text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground">
              {n.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {account ? null : (
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link to="/login" />} className="text-foreground">
              Sign in
            </Button>
          )}
          <Button size="sm" nativeButton={false} render={ctaLink(primary.href)} className="hidden sm:inline-flex">
            {primary.label}
          </Button>
          <Dialog
            open={drawerOpen}
            onOpenChange={setDrawerOpen}
            onOpenChangeComplete={(open) => {
              if (open || !pendingSection.current) return;
              document.getElementById(pendingSection.current)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
              pendingSection.current = null;
            }}
          >
            <DialogTrigger aria-label="Open menu" className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border md:hidden">
              <ListIcon aria-hidden className="size-5" />
            </DialogTrigger>
            <DialogContent
              showClose={false}
              className="top-auto right-3 bottom-3 left-3 max-h-[calc(100dvh-1.5rem)] w-auto max-w-none translate-x-0 translate-y-0 overflow-y-auto overscroll-contain rounded-xl bg-background p-4 md:hidden"
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2.5 text-[15px] font-semibold">
                  <Logo size={22} />
                  <DialogTitle className="text-[15px]">Heardsy menu</DialogTitle>
                </span>
                <DialogClose aria-label="Close menu" className="inline-flex size-10 items-center justify-center rounded-md border border-border">
                  <XIcon aria-hidden className="size-5" />
                </DialogClose>
              </div>
              <nav aria-label="Main">
                <ul className="flex flex-col divide-y divide-border rounded-lg border border-border text-sm">
                  {links.map((n) => (
                    <li key={n.label}>
                      <a
                        href={n.href}
                        onClick={(e) => {
                          if (n.href.startsWith("#")) {
                            e.preventDefault();
                            pendingSection.current = n.href.substring(1);
                          }
                          setDrawerOpen(false);
                        }}
                        className="flex min-h-11 items-center px-3 text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {n.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
              <div className="flex flex-col gap-2">
                <Button full size="lg" nativeButton={false} render={ctaLink(primary.href)}>
                  {primary.label}
                </Button>
                {account ? null : (
                  <Button full size="lg" variant="secondary" nativeButton={false} render={<Link to="/login" />}>
                    Sign in
                  </Button>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </header>
  );
}

const agents = [
  ["Claude Code", "claude"],
  ["Cursor", "cursor"],
  ["Codex", "openai"],
  ["ChatGPT", "openai"],
  ["Gemini CLI", "googlegemini"],
] as const;

// Signs the visitor in as the demo admin. Needs the demo subdomain, so it
// hides on installs without a root domain.
function DemoButton() {
  const root = useLoaderData({ from: "__root__" });
  const href = workspaceUrl(DEMO_WORKSPACE_ID, root?.rootDomain ?? null, "/demo");
  if (href === "/demo") return null;
  return (
    <Button size="lg" variant="secondary" nativeButton={false} render={<a href={href} />}>
      Try the demo
    </Button>
  );
}

export function Hero() {
  const { start, account } = useLandingCtas();
  const primary = account ?? start;
  return (
    <section id="hero" className="relative w-full">
      <div className="relative flex w-full flex-col items-center px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-8 pt-16 md:gap-10 md:pt-28">
          <div className="flex flex-col items-center gap-5">
            <BlurFade delay={0}>
              <h1 className="text-center text-[32px] leading-[1.1] font-semibold tracking-[-0.03em] text-balance sm:text-5xl md:text-6xl xl:text-[68px] xl:leading-[1.02]">The open source Canny alternative</h1>
            </BlurFade>
            <BlurFade delay={0.08}>
              <p className="max-w-[54ch] text-center text-base leading-relaxed text-pretty text-muted-foreground md:text-lg">Users post and vote. Your agents read the top requests, move the roadmap and draft the changelog. Self-host on your own Cloudflare account, or use the cloud.</p>
            </BlurFade>
          </div>
          <BlurFade delay={0.16}>
            <div className="flex flex-col items-center gap-6">
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button size="lg" arrow nativeButton={false} render={ctaLink(primary.href)}>
                  {primary.label}
                </Button>
                <DemoButton />
              </div>
              <ul role="list" aria-label="Works with" className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
                <li className="text-xs font-medium text-muted-foreground" aria-hidden>
                  Works with
                </li>
                {agents.map(([name, mark]) => (
                  <li key={name} className="inline-flex items-center gap-2 text-[13px] text-muted-foreground">
                    <span aria-hidden className="size-3.5 shrink-0 bg-current [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" style={{ maskImage: `url(/landing/logos/${mark}.svg)` }} />
                    {name}
                  </li>
                ))}
              </ul>
            </div>
          </BlurFade>
        </div>
      </div>
      <BlurFade delay={0.28} className="relative mt-12 px-4 md:px-6">
        <figure className="relative size-full overflow-hidden rounded-2xl border border-input bg-card">
          <div aria-hidden className="flex items-center gap-2 border-b border-border px-4 py-2.5">
            <span className="size-2.5 rounded-full bg-input" />
            <span className="size-2.5 rounded-full bg-input" />
            <span className="size-2.5 rounded-full bg-input" />
            <span className="mx-auto rounded-md bg-background px-3 py-0.5 text-[11px] text-muted-foreground">feedback.acme.com</span>
          </div>
          <picture>
            <source srcSet="/landing/board.webp" type="image/webp" />
            <img src="/landing/board.png" alt="A Heardsy public board: feature requests ranked by votes, with boards and roadmap counts beside them" width={1920} height={1080} className="block aspect-[4/3] w-full object-cover object-top sm:aspect-[1920/1000]" fetchPriority="high" />
          </picture>
        </figure>
      </BlurFade>
      <div className="h-10" />
    </section>
  );
}

const bullets = [
  ["Ask in plain English", "“What are the five most-voted requests that are still open?”"],
  ["Act, not just read", "Move a post to Planned, merge duplicates, reply to a voter."],
  ["Draft the changelog", "Closed posts become a ready-to-edit entry. Followers get an email on publish."],
  ["Your keys, your scope", "One key reaches every workspace you administer, or limit it to one. Hashed, shown once, revoke any time."],
];

export function Agents() {
  return (
    <Framed id="agents">
      <SectionHeader title="Run it through the agent you already use." sub="An MCP server and an HTTP API ship with it. Connect Claude Code, Cursor or Codex from the API keys page, then triage feedback, update the roadmap and draft the changelog from where you already work." />
      <div className="grid md:grid-cols-[380px_1fr]">
        <dl className="flex flex-col gap-6 border-b border-border p-6 md:border-r md:border-b-0">
          {bullets.map(([t, d]) => (
            <div key={t}>
              <dt className="text-[15px] font-medium">{t}</dt>
              <dd className="mt-1 text-[14px] leading-relaxed text-muted-foreground">{d}</dd>
            </div>
          ))}
        </dl>
        <div className="min-w-0 p-6">
          <Terminal title="claude — openheard-mcp" className="min-h-[320px] md:min-h-[400px]">
            <TypingAnimation delay={300}>› Publish a changelog for what shipped this week. Keep it concise.</TypingAnimation>
            <AnimatedSpan delay={2400} className="text-muted-foreground">● I&apos;ll pull this week&apos;s shipped posts, draft an entry and show it before publishing.</AnimatedSpan>
            <AnimatedSpan delay={3000} className="pl-4 text-link">└ openheard.list_posts status=shipped sort=new → 4 posts</AnimatedSpan>
            <AnimatedSpan delay={3500} className="pl-4 text-link">└ openheard.draft_changelog → draft ready, 3 linked posts</AnimatedSpan>
            <AnimatedSpan delay={4100} className="text-muted-foreground">● Draft: “Dark mode for the widget, merge without losing votes, Slack status alerts.”</AnimatedSpan>
            <TypingAnimation delay={4800}>› Looks good. Publish and email the followers.</TypingAnimation>
            <AnimatedSpan delay={6400} className="pl-4 text-status-shipped">└ openheard.publish_changelog → published, 128 followers emailed</AnimatedSpan>
            <AnimatedSpan delay={7000} className="text-muted-foreground">● Done. Live at acme.openheard.com/changelog/this-week</AnimatedSpan>
          </Terminal>
        </div>
      </div>
    </Framed>
  );
}
