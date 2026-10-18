import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { clientIp } from "./api/client-ip";
import { evaluatePrelaunchGate, PRELAUNCH_GATE_QUERY_PARAM } from "./api/prelaunch-gate";
import { apiRateLimiter } from "./api/rate-limit";
import { ipRateLimitKey } from "./api/rate-limit-key";
import { kabinetLimiters } from "./kabinet/limiters";
import { isChargedKabinetPageLoad, kabinetPageLoadAllowed } from "./kabinet/page-limit";
import { SITE_IS_PUBLICLY_DISCOVERABLE } from "./seo-flags";

/**
 * Two independent responsibilities, both here because `proxy.ts` is the one
 * place in this app that sees a request before any page renders or any
 * `/api/rpc` handler runs.
 *
 * **The pre-launch gate**, added 2026-09-13 — a bot shutter, NOT a security
 * boundary. While `SITE_IS_PUBLICLY_DISCOVERABLE` is false (`./seo-flags.ts`),
 * every request 403s unless it carries the shared secret below, except the
 * kabinet's own routes (`isGateExemptPath`, IN-Q1), which have their own
 * authentication and must work from a magic link in a fresh browser, and
 * Vercel's cron calls (`isCronPath`, KH-T5), which carry `CRON_SECRET`. Full
 * reasoning for what this does and does not protect, why there's no
 * user-agent carve-out, and why the `?gate=` secret appearing in logs and
 * browser history is accepted rather than fixed: `./api/prelaunch-gate.ts`'s
 * own top comment — the authoritative source, not duplicated here. Incident
 * writeup: `docs/decisions-pending-review.md`. The gate comes down in the
 * same change that flips `SITE_IS_PUBLICLY_DISCOVERABLE` — see that flag's
 * own comment and `docs/build-plan.md`'s launch-gate section.
 *
 * **Per-IP rate limiting**, for pages that render through the in-process
 * router client (`api/server-client.ts`), not the HTTP `/api/rpc` route.
 * `docs/gallery-contract-decisions.md` §5 decided that Server Components
 * call the router in-process — no HTTP request, no code path through
 * `app/api/rpc/[...rpc]/route.ts`, and therefore none of the rate limiting
 * that route applies. A page URL is a more natural scrape target than the
 * raw RPC endpoint the HTTP path still protects, so this closes that gap
 * for the pages it covers (`isDiscoveryPagePath` below) — narrower than the
 * gate above, which covers the whole site. The `/kabinet` pages have the
 * same gap and are limited here too, on the kabinet's own limiters
 * (`kabinet/page-limit.ts`, KH-Q8).
 *
 * `proxy.ts`, not `middleware.ts` — Next.js 16 renamed the convention (file
 * and exported function both) and defaults this file to the Node.js runtime
 * rather than Edge, which is also why the DB-dependent reveal limiter was
 * split into its own file rather than this one needing to avoid importing
 * it: single responsibility was the reason regardless of which runtime ended
 * up applying.
 *
 * Reuses `apiRateLimiter` rather than a second instance with its own budget.
 * In production (Phase 3, block 4, `docs/handoff-2026-10-04.md` §3) this is
 * now genuinely shared: `apiRateLimiter` is Upstash-backed whenever its
 * credentials are configured, and this proxy and the HTTP route — separate
 * deployment units on Vercel with independent module graphs — both read and
 * write the *same* Redis keys, not two independent counters. Only the
 * in-memory fallback (no Upstash credentials — local dev, CI, the harness)
 * still has the old per-instance gap: 100/min through this path *plus*
 * 100/min through the API, 200/min combined, not one shared 100/min bucket.
 * `rate-limit.ts`'s own comment carries the full account; this one exists
 * so neither half of the story is missed reading this file in isolation.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (
    !SITE_IS_PUBLICLY_DISCOVERABLE &&
    !isGateExemptPath(request.nextUrl.pathname) &&
    !isCronPath(request.nextUrl.pathname)
  ) {
    const decision = evaluatePrelaunchGate(
      request.headers.get("cookie"),
      request.nextUrl.searchParams.get(PRELAUNCH_GATE_QUERY_PARAM),
    );
    if (decision.kind === "denied") {
      return new NextResponse("Not Found", { status: 403 });
    }
    if (decision.kind === "allowed_mint_cookie") {
      const response = await respectingRateLimit(request);
      response.headers.append("Set-Cookie", decision.setCookieHeader);
      return response;
    }
  }

  return respectingRateLimit(request);
}

async function respectingRateLimit(request: NextRequest): Promise<NextResponse> {
  const now = new Date();
  if (
    isDiscoveryPagePath(request.nextUrl.pathname) &&
    !(await apiRateLimiter.check(ipRateLimitKey(clientIp(request)), now))
  ) {
    return new NextResponse("Too Many Requests", { status: 429 });
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
  return NextResponse.next();
}

/**
 * The kabinet's own routes skip the pre-launch gate (IN-Q1, Oleksii: "exempt
 * exactly /api/auth/*, /api/kabinet/*, /kabinet/*"). A magic link opened in a
 * fresh browser carries no gate cookie, so without this a shelter could
 * never complete sign-in. These routes have their own authentication; the
 * gate is a bot shutter, not that. Matched by whole path segment, so
 * `/api/authx`, `/api/kabinetx` and `/kabinetx` stay gated like everything
 * else.
 */
const GATE_EXEMPT_PREFIXES = ["/api/auth", "/api/kabinet", "/kabinet"] as const;

export function isGateExemptPath(pathname: string): boolean {
  return GATE_EXEMPT_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Vercel's cron calls skip the pre-launch gate (inbox KH-T5): Vercel sends no
 * gate cookie, so a gated cron path would answer 403 on every run and never
 * delete anything, and the /pro promise that expired sign-in records go
 * within a day (KH-Q12) would be false from the first day. Each cron route
 * authenticates itself with `CRON_SECRET` and fails closed without it
 * (`kabinet/auth-cleanup.ts`); the gate is a bot shutter, not that. Exact
 * paths, not a prefix, so a route added under `/api/cron/` later is gated
 * until someone lists it here on purpose.
 */
const CRON_PATHS: readonly string[] = ["/api/cron/auth-cleanup"];

export function isCronPath(pathname: string): boolean {
  return CRON_PATHS.includes(pathname);
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
 * and every app page, is in scope (the kabinet's routes and the cron path are
 * exempted inside `proxy`, by path, not here): "every request" per the decision this
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
