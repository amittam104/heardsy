import { createFileRoute } from "@tanstack/react-router";

import loader from "@/lib/private-widget-loader.js?raw";

// The Private Feedback Widget's embed script. Static; the receiving workspace
// comes from the script tag's data-workspace attribute.
export const Route = createFileRoute("/private-widget.js")({
  server: {
    handlers: {
      GET: async () =>
        new Response(loader, {
          headers: {
            "content-type": "application/javascript; charset=utf-8",
            "cache-control": "public, max-age=300, s-maxage=3600",
            "access-control-allow-origin": "*",
          },
        }),
    },
  },
});
