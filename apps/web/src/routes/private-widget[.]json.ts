import { createFileRoute } from "@tanstack/react-router";

const CORS = { "access-control-allow-origin": "*", "content-type": "application/json; charset=utf-8" };

// What the private loader needs before it mounts: the receiver's name and its
// widget's saved look. Public and safe for any origin; it never carries
// origins, team data, reports or counts. The edge caches it per receiver.
export const Route = createFileRoute("/private-widget.json")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const [{ createDb }, { privateReceiver }, { rateLimit, rateLimitResponse }, { privateWidgetConfig }] = await Promise.all([
          import("@openheard/db"),
          import("@/lib/private-receiver"),
          import("@/lib/rate-limit"),
          import("@/lib/ops/private-widget"),
        ]);
        const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
        const limited = await rateLimit(`private-widget-json:${ip}`, { window: 60, max: 120 });
        if (!limited.allowed) {
          const res = rateLimitResponse(limited.retryAfter ?? 60);
          res.headers.set("access-control-allow-origin", "*");
          return res;
        }
        const ws = await privateReceiver(request);
        if (!ws) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { ...CORS, "cache-control": "no-store" } });
        return new Response(JSON.stringify(await privateWidgetConfig(createDb(), ws)), { headers: { ...CORS, "cache-control": "public, max-age=60" } });
      },
    },
  },
});
