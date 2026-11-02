import { clientIp } from "../../../api/client-ip";
import { handleMonitoringTunnel } from "../../../api/monitoring-tunnel";
import { sharedRateLimiter } from "../../../api/rate-limit";
import { ipRateLimitKey } from "../../../api/rate-limit-key";

/** Its own budget, apart from the page and API ones: an error loop in one browser must not spend them. */
const limiter = sharedRateLimiter({ name: "monitoring", windowMs: 60_000, maxRequests: 20 });

/**
 * The browser SDK's tunnel to Sentry: the page talks only to its own origin (CSP `connect-src
 * 'self'` stays as it is). Everything is in `handleMonitoringTunnel`.
 */
export async function POST(request: Request): Promise<Response> {
  return handleMonitoringTunnel(request, {
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    ipKey: ipRateLimitKey(clientIp(request)),
    limiter,
    now: new Date(),
    forward: fetch,
  });
}

const notPost = () =>
  new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
export const GET = notPost;
export const PUT = notPost;
export const PATCH = notPost;
export const DELETE = notPost;
export const HEAD = notPost;
export const OPTIONS = notPost;
