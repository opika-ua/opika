import { clientIp } from "../../../api/client-ip";
import { handleHealth } from "../../../api/health";
import { inMemoryRateLimiter, loggingRefusals } from "../../../api/rate-limit";
import { ipRateLimitKey } from "../../../api/rate-limit-key";

/**
 * Its own budget: a 1-minute monitor plus a few manual probes fit with room; a flood does not.
 * In memory, so a probe costs no Upstash command (owner, 2026-11-20): the limit is per instance.
 */
const limiter = loggingRefusals(
  "health",
  inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 30 }),
);

/** Uptime probe target. No database call on purpose: it says the deploy answers, not that Neon does. */
function handle(request: Request): Promise<Response> {
  return handleHealth(request, {
    sha: process.env.VERCEL_GIT_COMMIT_SHA,
    ipKey: ipRateLimitKey(clientIp(request)),
    limiter,
    now: new Date(),
  });
}

export const GET = handle;
export const HEAD = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
