import { createFileRoute, redirect } from "@tanstack/react-router";
import { Suspense, lazy } from "react";

import { Board, hasBoardSearch, loadBoard, validateBoardSearch } from "@/components/board";
import { FeedSkeleton } from "@/components/states";

const Landing = lazy(() => import("../components/landing/page").then((m) => ({ default: m.Landing })));

// A workspace subdomain opens on its board; the main origin opens on the
// landing page and keeps the board at /feedback.
export const Route = createFileRoute("/")({
  validateSearch: validateBoardSearch,
  loaderDeps: ({ search }) => search,
  loader: async ({ deps, parentMatchPromise }) => {
    const parent = await parentMatchPromise;
    if (parent.loaderData?.boardPath !== "/") {
      // Old board links with filters keep working.
      if (hasBoardSearch(deps)) throw redirect({ to: "/feedback", search: deps });
      return { posts: [], total: 0, landing: true as const };
    }
    return { ...(await loadBoard(deps, parent.loaderData)), landing: false as const };
  },
  head: ({ loaderData }) => {
    if (!loaderData?.landing) return {};
    const title = "Heardsy · open source feedback";
    const description =
      "Collect feedback, let users vote, ship a public roadmap and changelog. Self-host in one command or use the cloud. Works with Claude, Cursor and any MCP agent.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
    };
  },
  component: IndexPage,
  pendingComponent: FeedSkeleton,
});

function IndexPage() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  if (data.landing) {
    return (
      <Suspense>
        <Landing />
      </Suspense>
    );
  }
  return <Board path="/" posts={data.posts} total={data.total} search={search} />;
}
