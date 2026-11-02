import type { RateLimiter } from "./rate-limit";
import { retryAfterSecondsOf } from "./retry-after";

const HEADERS = { "cache-control": "no-store", "x-robots-tag": "noindex" } as const;

/** The build SHA and nothing else: no database, no env names, no versions of anything. */
export async function handleHealth(
  request: Request,
  deps: { sha: string | undefined; ipKey: string; limiter: RateLimiter; now: Date },
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { ...HEADERS, allow: "GET, HEAD" },
    });
  }
  if (!(await deps.limiter.check(deps.ipKey, deps.now))) {
    const retry = String(retryAfterSecondsOf(deps.limiter, deps.ipKey, deps.now));
    return new Response("Too Many Requests", {
      status: 429,
      headers: { ...HEADERS, "retry-after": retry },
    });
  }
  const sha = deps.sha && /^[0-9a-f]{7,64}$/i.test(deps.sha) ? deps.sha : "unknown";
  return Response.json({ sha }, { headers: HEADERS });
}
