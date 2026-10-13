import { ChatCircleIcon, PushPinIcon, XIcon } from "@phosphor-icons/react";
import { Link, redirect, useLoaderData, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@openheard/ui/components/button";
import { Avatar, StatusLabel } from "@/components/bits";
import { NewPostDialog, type OptimisticPost } from "@/components/new-post-dialog";
import { RailItem, RailLabel, Shell } from "@/components/shell";
import { VoteButton } from "@/components/vote-button";
import { listPosts } from "@/functions/posts";
import type { getWorkspace } from "@/functions/workspace";
import { openSignIn, takeComposerRequest } from "@/lib/pending-action";
import type { BoardPath } from "@/lib/session";
import { roadmapStatuses } from "@/lib/status";
import { ago } from "@/lib/time";
import { useKeyNav } from "@/lib/use-key-nav";
import { cn } from "@openheard/ui/lib/utils";

export type BoardSearch = { board?: string; status?: string; q?: string; sort?: "top" | "new" };

export const validateBoardSearch = (s: Record<string, unknown>): BoardSearch => ({
  board: typeof s.board === "string" ? s.board : undefined,
  status: typeof s.status === "string" && s.status ? s.status : undefined,
  q: typeof s.q === "string" && s.q ? s.q : undefined,
  sort: s.sort === "top" || s.sort === "new" ? s.sort : undefined,
});

export const hasBoardSearch = (s: BoardSearch) => !!(s.board || s.status || s.q || s.sort);

type Root = Awaited<ReturnType<typeof getWorkspace>> | undefined;

export async function loadBoard(deps: BoardSearch, root: Root) {
  const data = await listPosts({ data: { ...deps, sort: deps.sort ?? "trending", limit: 30 } });
  if (data.total === 0 && !deps.q && !deps.board && !deps.status) {
    // The schema default name means setup never ran; any chosen name, Heardsy included, is final.
    if (!root?.marketing && root?.user?.role === "admin" && root.workspace.name === "openheard") throw redirect({ to: "/welcome" });
  }
  return data;
}

type Post = Awaited<ReturnType<typeof listPosts>>["posts"][number];

export function Board({ path, posts: firstPage, total, search }: { path: BoardPath; posts: Post[]; total: number; search: BoardSearch }) {
  const root = useLoaderData({ from: "__root__" });
  const navigate = useNavigate();
  const router = useRouter();
  const [composing, setComposing] = useState(false);
  const [optimisticPost, setOptimisticPost] = useState<OptimisticPost | null>(null);
  const [more, setMore] = useState<Post[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  // A page asked for under one filter must not land under the next one.
  const page = useRef(firstPage);
  page.current = firstPage;
  useEffect(() => {
    setMore([]);
    setLoadingMore(false);
  }, [firstPage]);
  const posts = more.length ? [...firstPage, ...more.filter((p) => !firstPage.some((f) => f.id === p.id))] : firstPage;

  function loadMore() {
    const asked = firstPage;
    setLoadingMore(true);
    listPosts({ data: { ...search, sort: search.sort ?? "trending", limit: 30, offset: posts.length } })
      .then((d) => {
        // Offsets can shift between pages, so a post may come back twice.
        if (page.current === asked) setMore((prev) => [...prev, ...d.posts.filter((p) => !prev.some((q) => q.id === p.id))]);
      })
      .catch(() => toast.error("Unable to load more posts. Check your connection and try again."))
      .finally(() => {
        if (page.current === asked) setLoadingMore(false);
      });
  }

  const compose = useRef(tryCompose);
  compose.current = tryCompose;
  useEffect(() => {
    const handler = () => {
      takeComposerRequest();
      compose.current();
    };
    window.addEventListener("openheard:open-composer", handler);
    // Asked for before this page was listening.
    if (takeComposerRequest()) compose.current();
    return () => window.removeEventListener("openheard:open-composer", handler);
  }, []);

  useEffect(() => {
    router.preloadRoute({ to: "/roadmap" } as unknown as Parameters<typeof router.preloadRoute>[0]);
    router.preloadRoute({ to: "/changelog" } as unknown as Parameters<typeof router.preloadRoute>[0]);
    for (const p of posts.slice(0, 10)) {
      router.preloadRoute({ to: "/p/$id", params: { id: String(p.id) } } as unknown as Parameters<typeof router.preloadRoute>[0]);
    }
  }, [router, posts]);

  const [focused, setFocused] = useKeyNav(posts.length, {
    open: (i) => navigate({ to: "/p/$id", params: { id: String(posts[i]!.id) } }),
    vote: (i) => document.querySelector<HTMLButtonElement>(`[data-row-index="${i}"] [data-vote]`)?.click(),
    search: () => document.querySelector<HTMLInputElement>("header input")?.focus(),
    create: tryCompose,
  });

  const go = (next: BoardSearch) => navigate({ to: path, search: next });
  const set = (patch: Partial<BoardSearch>) => go({ ...search, ...patch });
  const sort = search.sort ?? "trending";
  const signedIn = !!root.user;
  const canPost = signedIn && (root.workspace.whoCanPost !== "members" || root.user?.role !== "guest");
  const filtered = !!(search.q || search.status || search.board);

  function tryCompose() {
    if (!signedIn) {
      openSignIn({ type: "compose" });
      return;
    }
    if (!canPost) return;
    setComposing(true);
  }

  const rail = (
    <>
      <Button full arrow size="lg" onClick={tryCompose} className="brand-cta max-lg:hidden">
        Post idea
      </Button>
      <nav aria-label="Boards" className="flex flex-col gap-0.5">
        <RailLabel>Boards</RailLabel>
        <RailItem active={!search.board} to={path} search={{ ...search, board: undefined }} label="All posts" count={root.total} />
        {root.boards.map((b) => (
          <RailItem key={b.id} active={search.board === b.id} to={path} search={{ ...search, board: search.board === b.id ? undefined : b.id }} label={b.name} count={b.count} />
        ))}
      </nav>
      <nav aria-label="Roadmap status" className="flex flex-col gap-0.5">
        <RailLabel>Roadmap</RailLabel>
        {roadmapStatuses(root.statuses)
          .filter((s) => s.kind !== "review")
          .map((s) => (
            <RailItem key={s.key} active={search.status === s.key} to={path} search={{ ...search, status: search.status === s.key ? undefined : s.key }} label={s.label} color={s.color} count={root.statusCounts[s.key] ?? 0} />
          ))}
      </nav>
    </>
  );

  return (
    <Shell rail={rail}>
      <h1 className="sr-only">{root.workspace.name} feedback</h1>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div role="group" aria-label="Sort posts" className="flex items-center gap-1">
          {(["trending", "top", "new"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={sort === s}
              onClick={() => set({ sort: s === "trending" ? undefined : s })}
              className={cn(
                "inline-flex h-8 items-center rounded-md px-2.5 text-[13px] capitalize outline-none transition-colors duration-150",
                sort === s ? "bg-secondary font-semibold text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground tabular-nums">
          {search.q ? (
            <span className="inline-flex h-7 max-w-full items-center gap-1 rounded-md border bg-card pr-0.5 pl-2 text-foreground">
              <span className="min-w-0 truncate" title={search.q}>
                “{search.q}”
              </span>
              <button type="button" onClick={() => set({ q: undefined })} aria-label="Clear search" className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground outline-none hover:bg-accent hover:text-foreground">
                <XIcon className="size-3" />
              </button>
            </span>
          ) : null}
          <span role="status">
            {total} {total === 1 ? "post" : "posts"}
          </span>
          {/* Below lg the rail drops under the feed, so posting needs its own button up here. */}
          <Button size="sm" arrow onClick={tryCompose} className="brand-cta font-sans lg:hidden">
            Post idea
          </Button>
        </div>
      </div>

      {posts.length === 0 && !optimisticPost ? (
        <EmptyBoard query={search.q} filtered={filtered} onNew={tryCompose} onClear={() => go({})} />
      ) : (
        <ol role="list" className="divide-y divide-border">
          {[...(optimisticPost ? [optimisticPost] : []), ...posts].map((p, i) => {
            const isOptimistic = "_optimistic" in p;
            const st = root.statuses.find((x) => x.key === p.status);
            const showStatus = st && st.kind !== "open";
            return (
              <li
                key={p.id}
                data-row-index={i}
                data-focused={focused === i || undefined}
                onMouseEnter={() => setFocused(i)}
                className={cn("group/row relative -mx-2 flex items-start gap-4 rounded-lg px-2 py-5 first:pt-3 sm:gap-6", isOptimistic && "opacity-60")}
              >
                  <span className="hidden w-8 shrink-0 pt-1 text-xs text-faint tabular-nums md:block">{sort === "trending" ? String(i + 1).padStart(2, "0") : ""}</span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex items-start gap-2 text-[15px] font-semibold tracking-[-0.01em] text-foreground/90 group-hover/row:text-foreground group-data-focused/row:text-foreground">
                      {p.pinned ? <PushPinIcon weight="fill" aria-label="Pinned" className="mt-1 size-3.5 shrink-0 text-muted-foreground" /> : null}
                      <h2 className="min-w-0 leading-snug text-pretty break-words">
                        <Link to="/p/$id" params={{ id: String(p.id) }} className="rounded-sm after:absolute after:inset-0 after:rounded-lg">
                          {p.title}
                        </Link>
                      </h2>
                    </div>
                    {p.excerpt ? <p className="line-clamp-2 max-w-[68ch] text-sm/6 text-pretty text-muted-foreground">{p.excerpt}</p> : null}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5 text-xs text-muted-foreground">
                      {showStatus ? <StatusLabel status={p.status} /> : null}
                      <span className="inline-flex items-center gap-1.5">
                        <ChatCircleIcon aria-hidden className="size-[13px] shrink-0" />
                        <span className="tabular-nums">
                          {p.commentCount}
                          <span className="sr-only"> {p.commentCount === 1 ? "comment" : "comments"}</span>
                        </span>
                      </span>
                      <span className="inline-flex min-w-0 items-center gap-1.5">
                        <Avatar name={p.author?.name ?? "?"} image={p.author?.image} size={16} />
                        <span className="min-w-0 truncate">{p.author?.name ?? "someone"}</span>
                        <span className="shrink-0">· {ago(p.createdAt)}</span>
                      </span>
                    </div>
                  </div>
                  <VoteButton postId={p.id} count={p.voteCount} voted={p.voted} signedIn={signedIn} anonymousVoting={root.workspace.anonymousVoting} className="relative z-10 group-data-focused/row:border-input" />
              </li>
            );
          })}
        </ol>
      )}
      {posts.length > 0 && posts.length < total ? (
        <div className="flex justify-center pt-2">
          <Button variant="secondary" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : `Show more (${total - posts.length})`}
          </Button>
        </div>
      ) : null}

      <NewPostDialog
        open={composing}
        onOpenChange={setComposing}
        boards={root.boards}
        defaultBoard={search.board}
        signedIn={signedIn}
        onOptimisticPost={(p) => {
          if (p && root.user) setOptimisticPost({ ...p, author: { name: root.user.name, image: root.user.image } });
          else setOptimisticPost(p);
        }}
      />
    </Shell>
  );
}

function EmptyBoard({ query, filtered, onNew, onClear }: { query?: string; filtered: boolean; onNew: () => void; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-20 text-center">
      <p className="text-[15px] font-semibold">{filtered ? "Nothing matches" : "No posts yet"}</p>
      <p className="max-w-sm text-sm text-pretty text-muted-foreground">
        {query ? <>No posts match “<span className="break-all">{query}</span>”. Clear the filters, or post it as a new idea.</> : filtered ? "Clear the filters, or post the idea you were looking for." : "The first post sets the tone. Say what you wish the product did."}
      </p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {filtered ? (
          <Button variant="secondary" onClick={onClear}>
            Clear filters
          </Button>
        ) : null}
        <Button arrow onClick={onNew} className="brand-cta">
          Post idea
        </Button>
      </div>
    </div>
  );
}
