import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { clientIp } from "./api/client-ip";
import { evaluatePrelaunchGate, PRELAUNCH_GATE_QUERY_PARAM } from "./api/prelaunch-gate";
import { apiRateLimiter } from "./api/rate-limit";
import { SITE_IS_PUBLICLY_DISCOVERABLE } from "./seo-flags";

/**
 * Two independent responsibilities, both here because `proxy.ts` is the one
 * place in this app that sees a request before any page renders or any
 * `/api/rpc` handler runs.
 *
 * **The pre-launch gate**, added 2026-09-13. While `SITE_IS_PUBLICLY_
 * DISCOVERABLE` is false (`./seo-flags.ts`), nothing about this deploy is
 * meant to be reachable by anyone who doesn't already know that — see
 * `docs/build-plan.md`'s "Before any route is indexed" launch-gate section.
 * Decided after ~100 req/min of sustained, unidentified traffic burned 4.2 GB
 * of Neon's 5 GB monthly transfer allowance against a corpus of 220
 * fabricated animals, noindexed, with no outreach done — `X-Robots-Tag:
 * noindex, nofollow` was already on every response, and whatever was doing
 * this ignored it. A politeness signal can't reach traffic that doesn't
 * read it; a 403 can. See `docs/decisions-pending-review.md` for the full
 * investigation. Deliberately **no user-agent carve-out** for OG-preview
 * bots (Telegram, Viber, Instagram): a spoofable header is a permanent hole
 * opened for a ten-minute verification task. The MVP gate's own preview
 * checks are done with the gate temporarily open instead. The gate comes
 * down in the same change that flips `SITE_IS_PUBLICLY_DISCOVERABLE` — see
 * that flag's own comment and `docs/build-plan.md`'s launch-gate section.
 *
 * **Per-IP rate limiting**, for pages that render through the in-process
 * router client (`api/server-client.ts`), not the HTTP `/api/rpc` route.
 * `docs/gallery-contract-decisions.md` §5 decided that Server Components
 * call the router in-process — no HTTP request, no code path through
 * `app/api/rpc/[...rpc]/route.ts`, and therefore none of the rate limiting
 * that route applies. A page URL is a more natural scrape target than the
 * raw RPC endpoint the HTTP path still protects, so this closes that gap
 * for the pages it covers (`isDiscoveryPagePath` below) — narrower than the
 * gate above, which covers the whole site.
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
  if (!SITE_IS_PUBLICLY_DISCOVERABLE) {
    const decision = evaluatePrelaunchGate(
      request.headers.get("cookie"),
      request.nextUrl.searchParams.get(PRELAUNCH_GATE_QUERY_PARAM),
    );
    if (decision.kind === "denied") {
      return new NextResponse("Not Found", { status: 403 });
    }
    if (decision.kind === "allowed_mint_cookie") {
      const response = respectingRateLimit(request);
      response.headers.append("Set-Cookie", decision.setCookieHeader);
      return response;
    }
  }

  return respectingRateLimit(request);
}

function respectingRateLimit(request: NextRequest): NextResponse {
  if (
    isDiscoveryPagePath(request.nextUrl.pathname) &&
    !apiRateLimiter.check(clientIp(request), new Date())
  ) {
    return new NextResponse("Too Many Requests", { status: 429 });
  }
  return NextResponse.next();
}

function isDiscoveryPagePath(pathname: string): boolean {
  return pathname === "/tvaryny" || pathname.startsWith("/tvaryny/");
}

/**
 * Every request this file's own matcher gets to run against, except the two
 * kinds excluded on purpose: Next's own hashed, content-addressed static
 * build assets (`_next/static`, `_next/image`) and `favicon.ico`. Excluding
 * them isn't a gate weakness — they reveal nothing about the site's content
 * and a browser that already holds the gate cookie needs them to render any
 * page at all. Everything else this matcher sees, including `/api/rpc/*`
 * and every app page, is in scope: "every request" per the decision this
 * gate implements, not only the specific routes a crawler happened to hit
 * this time.
 *
 * ⚠ Not literally every request the app can produce a response for. Next's
 * config-level `redirects()` (`next.config.ts`: `/` → `/tvaryny`, `/discovery`
 * → `/tvaryny/gortaty`) run before this file at all — both are checked
 * without the gate seeing them, and both stay 308s regardless of the gate
 * secret. Left ungated deliberately, not overlooked: neither serves any
 * content, only a redirect to a route the gate *does* cover, so nothing is
 * exposed by the gap — an unauthenticated caller still hits the gate the
 * moment they follow either redirect.
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
