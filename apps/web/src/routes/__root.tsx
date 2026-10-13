import { Toaster } from "@openheard/ui/components/sonner";
import { HeadContent, Outlet, Scripts, ScrollRestoration, createRootRouteWithContext, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

import Footer from "../components/footer";
import Header from "../components/header";
import { SkipLink } from "../components/bits";
import Logo from "../components/logo";
import { SignInDialog } from "../components/sign-in-dialog";

import { getWorkspace } from "../functions/workspace";
import { officialWidgetSrc } from "../lib/official-widget";
import type { MissingWorkspace } from "../lib/session";
import { DASHBOARD_THEME_KEY, boardThemeKey, brandForeground, themeScript, useVisitorTheme } from "../lib/visitor-theme";
import appCss from "../index.css?url";
import geistLatinFont from "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url";

export interface RouterAppContext {}

const VITE_ENV = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
const OPENPANEL_CLIENT_ID = VITE_ENV.VITE_OPENPANEL_CLIENT_ID;
// Self-hosted or cloud OpenPanel. Script and ingest both live under this origin.
const OPENPANEL_URL = (VITE_ENV.VITE_OPENPANEL_URL ?? "https://openpanel.dev").replace(/\/$/, "");

export const Route = createRootRouteWithContext<RouterAppContext>()({
  loader: () => getWorkspace(),
  head: ({ loaderData, matches }) => {
    // The widget runs inside other people's apps; it never loads our analytics.
    const embedded = matches.some((m) => (m.routeId as string) === "/widget" || (m.routeId as string) === "/private-widget");
    const title = loaderData ? `${loaderData.workspace.name} · feedback` : "Heardsy";
    const description = loaderData?.workspace.tagline ?? "Open source feedback board.";
    // A self-hoster's own share image; its size is theirs to know, so no hints.
    const ogImage = loaderData?.ogImage;
    const logo = loaderData?.workspace.logoUrl;
    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title },
        { name: "description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:site_name", content: loaderData?.workspace.name ?? "Heardsy" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        ...(ogImage
          ? [{ property: "og:image", content: ogImage }]
          : [
              { property: "og:image", content: "https://openheard.com/og.jpg" },
              { property: "og:image:width", content: "1200" },
              { property: "og:image:height", content: "630" },
            ]),
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: ogImage || "https://openheard.com/og.jpg" },
      ],
      links: [
      { rel: "preload", href: geistLatinFont, as: "font", type: "font/woff2", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: appCss },
      // The workspace logo is the tab icon once one is set.
      logo ? { rel: "icon", href: logo } : { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
    // Analytics only when a client id is set at build time, so self-hosters send nothing by default.
    scripts: OPENPANEL_CLIENT_ID && !embedded
      ? [
          { src: `${OPENPANEL_URL}/op1.js`, defer: true, async: true },
          {
            children: `window.op=window.op||function(){(window.op.q=window.op.q||[]).push(arguments)};window.op('init',${JSON.stringify({ clientId: OPENPANEL_CLIENT_ID, apiUrl: `${OPENPANEL_URL}/api`, trackScreenViews: true, trackOutgoingLinks: true, trackAttributes: true })});`,
          },
        ]
      : [],
    };
  },
  component: RootDocument,
  notFoundComponent: ({ data }) => {
    const missing = data as MissingWorkspace | undefined;
    if (missing?.missingWorkspace) return <NoBoard {...missing} />;
    return (
      <main className="mx-auto max-w-3xl px-8 py-24 text-center">
        <h1 className="text-xl font-semibold">Nothing here</h1>
        <p className="mt-2 text-muted-foreground">That page or workspace does not exist. Check the address, or start again from the home page.</p>
        <a href="/" className="mt-6 inline-block text-sm text-link hover:underline">
          Go to the home page
        </a>
      </main>
    );
  },
});

// A subdomain with no workspace behind it.
function NoBoard({ missingWorkspace, rootDomain, signedIn }: MissingWorkspace) {
  const home = `https://${rootDomain ?? "openheard.com"}`;
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
      <a href={home} aria-label="Heardsy home" className="mb-3">
        <Logo size={32} />
      </a>
      <h1 className="text-xl font-semibold">There is no board here yet</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Nobody has made a workspace at {missingWorkspace}.{rootDomain ?? "openheard.com"} yet.
      </p>
      <div className="mt-3 flex items-center gap-5 text-sm font-medium">
        {signedIn ? (
          <a href={`${home}/new?slug=${encodeURIComponent(missingWorkspace)}`} className="text-link hover:underline">
            Create this workspace
          </a>
        ) : null}
        <a href={home} className="text-muted-foreground hover:text-foreground">
          Go to {rootDomain ?? "openheard.com"}
        </a>
      </div>
    </main>
  );
}

const BARE_PAGES = ["/login", "/reset-password", "/join/", "/new", "/welcome", "/start", "/widget", "/private-widget"];

function RootDocument() {
  const data = Route.useLoaderData();
  const pathname = useRouterState({ select: (s) => (s.resolvedLocation ?? s.location).pathname });
  const admin = pathname.startsWith("/dashboard");
  // The main origin opens on the marketing page; a workspace subdomain
  // previews it at /landing.
  const marketing = pathname === "/landing" || (pathname === "/" && !!data && data.boardPath !== "/");
  // Our own feedback widget, added after hydration so it never blocks the page.
  const feedbackWidget = data ? officialWidgetSrc({ marketing: !!data.marketing, rootDomain: data.rootDomain, pathname }) : null;
  useEffect(() => {
    if (!feedbackWidget || document.getElementById("openheard-official-widget")) return;
    const script = document.createElement("script");
    script.id = "openheard-official-widget";
    script.src = feedbackWidget;
    script.async = true;
    document.body.appendChild(script);
  }, [feedbackWidget]);
  const bare = BARE_PAGES.some((p) => pathname === p || pathname.startsWith(p));
  // The embedded widget takes its theme from the loader, which settles "auto"
  // against the visitor's system; dark when it does not say.
  const widget = pathname.startsWith("/widget") || pathname === "/private-widget";
  const widgetTheme = useRouterState({ select: (s) => ((s.resolvedLocation ?? s.location).search as { theme?: string }).theme });
  // Public pages follow the visitor's saved light / dark / auto choice, or
  // the workspace theme when they have not picked one.
  const visitorPage = !widget && !admin && !marketing;
  const workspaceTheme = data?.workspace.theme === "light" ? "light" : "dark";
  const visitor = useVisitorTheme(boardThemeKey(data?.workspace.id ?? ""), workspaceTheme, visitorPage && !!data);
  // The dashboard keeps its own choice, dark until one is made.
  const dashboard = useVisitorTheme(DASHBOARD_THEME_KEY, "dark", admin && !!data);
  const dark = widget ? !((pathname === "/widget" || pathname === "/private-widget") && widgetTheme === "light") : visitorPage ? visitor.dark : admin ? dashboard.dark : true;
  const theme = dark ? "dark" : "";
  // Workspace accent applies to the public board only; the dashboard keeps ours.
  // The private frame takes its accent from its own receiver's config instead.
  const accentColor = !admin && pathname !== "/private-widget" ? data?.workspace.accent : null;
  const accent = accentColor
    ? ({ "--link": accentColor, "--ring": accentColor, "--link-foreground": brandForeground(accentColor) } as React.CSSProperties)
    : undefined;
  // No loader data means the root loader found no workspace for this host;
  // the outlet holds the not-found page and nothing else has a workspace to read.
  if (!data) {
    return (
      <html lang="en" className="dark">
        <head>
          <HeadContent />
        </head>
        <body>
          <div className="flex min-h-svh flex-col">
            <Outlet />
          </div>
          <Scripts />
        </body>
      </html>
    );
  }
  return (
    // The head script may change the class before hydration, so React is
    // told not to flag the difference on <html>.
    <html lang="en" className={theme} style={accent} data-brand={accentColor && visitorPage ? "" : undefined} suppressHydrationWarning>
      <head>
        {visitorPage ? <script dangerouslySetInnerHTML={{ __html: themeScript(boardThemeKey(data.workspace.id), workspaceTheme) }} /> : null}
        {admin ? <script dangerouslySetInnerHTML={{ __html: themeScript(DASHBOARD_THEME_KEY, "dark") }} /> : null}
        <HeadContent />
      </head>
      <body>
        {admin ? (
          <div className="h-dvh overflow-hidden">
            <Outlet />
          </div>
        ) : marketing ? (
          <Outlet />
        ) : bare ? (
          <div className="flex min-h-svh flex-col">
            <Outlet />
          </div>
        ) : (
          <div className="flex min-h-svh flex-col">
            <SkipLink />
            <Header />
            <div id="main" tabIndex={-1} className="flex flex-1 flex-col">
              <Outlet />
            </div>
            <Footer />
          </div>
        )}
        <SignInDialog />
        <Toaster position="bottom-right" />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
