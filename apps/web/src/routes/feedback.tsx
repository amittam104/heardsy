import { createFileRoute, redirect } from "@tanstack/react-router";

import { Board, loadBoard, validateBoardSearch } from "@/components/board";
import { FeedSkeleton } from "@/components/states";

// The board on the main origin. A workspace subdomain keeps its board at "/".
export const Route = createFileRoute("/feedback")({
  validateSearch: validateBoardSearch,
  loaderDeps: ({ search }) => search,
  loader: async ({ deps, parentMatchPromise }) => {
    const parent = await parentMatchPromise;
    if (parent.loaderData?.boardPath === "/") throw redirect({ to: "/", search: deps });
    return loadBoard(deps, parent.loaderData);
  },
  component: FeedbackPage,
  pendingComponent: FeedSkeleton,
});

function FeedbackPage() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  return <Board path="/feedback" posts={data.posts} total={data.total} search={search} />;
}
