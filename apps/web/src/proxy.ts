import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { clientIp } from "./api/client-ip";
import { apiRateLimiter } from "./api/rate-limit";

/**
 * Per-IP rate limiting for pages that render through the in-process router
 * client (`api/server-client.ts`), not the HTTP `/api/rpc` route.
 *
 * `docs/gallery-contract-decisions.md` §5 decided that Server Components call
 * the router in-process — no HTTP request, no code path through
 * `app/api/rpc/[...rpc]/route.ts`, and therefore none of the rate limiting
 * that route applies. A page URL is a more natural scrape target than the raw
 * RPC endpoint the HTTP path still protects, so this proxy is what closes
 * that gap for the pages it covers.
 *
 * `proxy.ts`, not `middleware.ts` — Next.js 16 renamed the convention (file
 * and exported function both) and defaults this file to the Node.js runtime
 * rather than Edge, which is also why the DB-dependent reveal limiter was
 * split into its own file rather than this one needing to avoid importing
 * it: single responsibility was the reason regardless of which runtime ended
 * up applying.
 *
 * Reuses `apiRateLimiter` rather than a second instance with its own budget —
 * but reuse does not mean shared state. This proxy and the HTTP route are
 * separate deployment units on Vercel with independent module graphs; each
 * gets its own `Map`. The effective ceiling per IP is 100/min through this
 * path *plus* 100/min through the API, 200/min combined, not one shared
 * 100/min bucket. `rate-limit.ts`'s own comment carries the same note; this
 * one exists so it isn't missed reading this file in isolation.
 */
export function proxy(request: NextRequest): NextResponse {
  const ip = clientIp(request);

  if (!apiRateLimiter.check(ip, new Date())) {
    return new NextResponse("Too Many Requests", { status: 429 });
  }

  return NextResponse.next();
}

/**
 * Both the bare path and every subpath, listed explicitly. Verified —
 * removed the bare `/tvaryny` entry and left only `/tvaryny/:path*`, and the
 * harness test below still passed: that pattern's zero-or-more segment does
 * cover the bare path on its own. Kept both anyway, because that's a fact
 * about `path-to-regexp`'s matching a future reader would otherwise have to
 * already know rather than see stated in the list itself — the explicit
 * form costs nothing and removes the question.
 */
export const config = {
  matcher: ["/tvaryny", "/tvaryny/:path*"],
};
