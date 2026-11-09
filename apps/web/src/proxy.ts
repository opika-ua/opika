import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { clientIp } from "./api/client-ip";
import { apiRateLimiter } from "./api/rate-limit";
import { ipRateLimitKey } from "./api/rate-limit-key";
import { retryAfterSecondsOf } from "./api/retry-after";
import { kabinetLimiters } from "./kabinet/limiters";
import { isChargedKabinetPageLoad, kabinetPageLoadAllowed } from "./kabinet/page-limit";
import { isTokenPage, TOKEN_PAGE_HEADERS } from "./kabinet/token-pages";

/**
 * The one place in this app that sees a request before any page renders or any
 * `/api/rpc` handler runs.
 *
 * Per-IP rate limiting, for pages that render through the in-process
 * router client (`api/server-client.ts`), not the HTTP `/api/rpc` route.
 * `docs/gallery-contract-decisions.md` §5 decided that Server Components
 * call the router in-process - no HTTP request, no code path through
 * `app/api/rpc/[...rpc]/route.ts`, and therefore none of the rate limiting
 * that route applies. A page URL is a more natural scrape target than the
 * raw RPC endpoint the HTTP path still protects, so this closes that gap
 * for the pages it covers (`isDiscoveryPagePath` below). The `/kabinet` pages have the
 * same gap and are limited here too, on the kabinet's own limiters
 * (`kabinet/page-limit.ts`, KH-Q8).
 *
 * `proxy.ts`, not `middleware.ts` - Next.js 16 renamed the convention (file
 * and exported function both) and defaults this file to the Node.js runtime
 * rather than Edge, which is also why the DB-dependent reveal limiter was
 * split into its own file rather than this one needing to avoid importing
 * it: single responsibility was the reason regardless of which runtime ended
 * up applying.
 *
 * Reuses `apiRateLimiter` rather than a second instance with its own budget.
 * In production (Phase 3, block 4, `docs/handoff-2026-10-04.md` §3) this is
 * now genuinely shared: `apiRateLimiter` is Upstash-backed whenever its
 * credentials are configured, and this proxy and the HTTP route - separate
 * deployment units on Vercel with independent module graphs - both read and
 * write the *same* Redis keys, not two independent counters. Only the
 * in-memory fallback (no Upstash credentials - local dev, CI, the harness)
 * still has the old per-instance gap: 100/min through this path *plus*
 * 100/min through the API, 200/min combined, not one shared 100/min bucket.
 * `rate-limit.ts`'s own comment carries the full account; this one exists
 * so neither half of the story is missed reading this file in isolation.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  return respectingRateLimit(request);
}

async function respectingRateLimit(request: NextRequest): Promise<NextResponse> {
  const now = new Date();
  if (isDiscoveryPagePath(request.nextUrl.pathname)) {
    const ipKey = ipRateLimitKey(clientIp(request));
    if (!(await apiRateLimiter.check(ipKey, now))) {
      return discoveryRateLimitedResponse(request, retryAfterSecondsOf(apiRateLimiter, ipKey, now));
    }
  }
  // KH-Q8: `/kabinet` pages draw on the kabinet API's own budgets (never the
  // adopter one, HS-Q10). Here rather than in the pages because a page
  // render can't answer 429; this is the one place that can, before the
  // page runs any query.
  //
  // `kabinet/runtime` (Better Auth, its Drizzle adapter, the database
  // client) is imported here, lazily, and only once the IP is within its
  // budget, not at the top of this file: the proxy runs on every route, and a
  // static import put Better Auth into every cold start, `/tvaryny`
  // included (review of the hardening, finding 3; measured in the inbox,
  // KH-T4). The limiters themselves come from `kabinet/limiters`, which is
  // as light as the adopter limiter above.
  if (
    isChargedKabinetPageLoad(request.method, request.nextUrl.pathname) &&
    !(await kabinetPageLoadAllowed(
      kabinetLimiters,
      {
        ip: clientIp(request),
        userId: async () =>
          (await import("./kabinet/runtime")).kabinetPageUserId(request.headers, now),
      },
      now,
    ))
  ) {
    return new NextResponse("Too Many Requests", { status: 429 });
  }
  const response = NextResponse.next();
  // A sign-in page whose URL carries a credential (a reset link's token, an invitation link's):
  // never cached, and no referrer sent anywhere (Oleksii, 2026-10-20, verbatim in
  // `kabinet/token-pages.ts`).
  if (isTokenPage(request.nextUrl)) {
    for (const [name, value] of Object.entries(TOKEN_PAGE_HEADERS))
      response.headers.set(name, value);
  }
  return response;
}

/**
 * RL-F1: the per-IP refusal on `/tvaryny` pages (and, since S6, the shelter page under
 * `/prytulky`). Oleksii, 2026-10-20, verbatim: "gives the rate-limited case its own state on both
 * the full page and the drawer, using the existing «Забагато запитів. Спробуйте ще раз пізніше.».
 * It never shows «Це не помилка…» for a rate limit."
 *
 * A proxy can't render React, and a rewrite to a page keeps the page's 200 (verified: the status
 * in the rewrite's init is ignored), so the refusal is a rewrite to `/rate-limited`, a route handler
 * that serves the branded `RateLimitedScreen` as a 429. `Retry-After` is set here from the limiter's
 * own state (QA 2026-10-29).
 */
function discoveryRateLimitedResponse(
  request: NextRequest,
  retryAfterSeconds: number,
): NextResponse {
  const target = request.nextUrl.clone();
  target.pathname = RATE_LIMITED_PATH;
  return NextResponse.rewrite(target, {
    status: 429,
    headers: { "retry-after": String(retryAfterSeconds), "x-robots-tag": "noindex" },
  });
}

const RATE_LIMITED_PATH = "/rate-limited";

/**
 * The public pages that read listings on every load: the gallery, the deck,
 * the animal page, and (designer round 1, S6) the shelter page, which reads
 * the shelter and a page of its animals the same way. Matched by whole path
 * segment, so `/prytulkam` (the static page for shelters) isn't one.
 */
const DISCOVERY_PAGE_PREFIXES = ["/tvaryny", "/prytulky"] as const;

function isDiscoveryPagePath(pathname: string): boolean {
  return DISCOVERY_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Every request except Next's hashed static assets, `favicon.ico`, and `/api/kabinet` and
 * `/api/auth`. Those two are out because a matched non-GET request has its whole body buffered
 * before the route runs, which defeats `/api/kabinet`'s 16 KB cap; buffering for the rest is
 * bounded by `PROXY_CLIENT_MAX_BODY_BYTES` in `next.config.ts`.
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/kabinet(?:/|$)|api/auth(?:/|$)).*)"],
};
