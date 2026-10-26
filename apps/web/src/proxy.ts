import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { clientIp } from "./api/client-ip";
import { evaluatePrelaunchGate, PRELAUNCH_GATE_QUERY_PARAM } from "./api/prelaunch-gate";
import { apiRateLimiter } from "./api/rate-limit";
import { ipRateLimitKey } from "./api/rate-limit-key";
import { kabinetLimiters } from "./kabinet/limiters";
import { isChargedKabinetPageLoad, kabinetPageLoadAllowed } from "./kabinet/page-limit";
import { isTokenPage, TOKEN_PAGE_HEADERS } from "./kabinet/token-pages";
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
    !isCronPath(request.nextUrl.pathname) &&
    !isGateExemptExactPath(request.nextUrl.pathname)
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
    return discoveryRateLimitedResponse();
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
const CRON_PATHS: readonly string[] = ["/api/cron/auth-cleanup", "/api/cron/r2-cleanup"];

export function isCronPath(pathname: string): boolean {
  return CRON_PATHS.includes(pathname);
}

/**
 * S8's saved-page batch read (`animals.cardsByIds`) is built to carry no
 * cookie at all — `credentials: "omit"` (DR1-Q2), so the request can never
 * be tied to an adopter's session or correlated across visits, and can
 * never satisfy this gate's own cookie check either. Without this
 * exemption, the endpoint 403s on every call before launch, making the
 * feature permanently non-functional rather than merely logged-out-looking
 * — found by running the saved-page harness against a real server, not
 * inferred.
 *
 * **S8-D1, settled.** An earlier version of this comment claimed the
 * exemption "leaks nothing… the same shape and visibility `/tvaryny`
 * already serves through the gate" — a reviewer correctly called that
 * false (`/tvaryny` still requires the gate cookie; this path, once
 * exempted, answers *anyone* holding an animal id and no cookie at all).
 * Oleksii's own answer, 2026-10-23 (option (b), exempt it): the gate is a
 * bot shutter, not a security boundary — his own 2026-09-13 note, quoted
 * in full in `prelaunch-gate.ts`'s own top comment. The ids this path is
 * ever called with come only from gated pages (the gallery, the animal
 * page — both require the gate cookie to reach at all), so exempting this
 * one batch-read procedure adds no way to enumerate ids that gating it
 * would otherwise have closed off. Enforced and tested, per his answer:
 * POST only (`route.ts`, `CARDS_BY_IDS_PATH`); at most 200 valid animal
 * ids (`MAX_SAVED_CARDS_PER_REQUEST`); the same per-IP rate limit as every
 * other procedure; the public `ShelterSummaryView` shape only, the same
 * shelter projection `/tvaryny/{id}` itself returns; `Cache-Control:
 * no-store`; nothing logged about which ids were asked for. Full record:
 * `docs/decisions-inbox.md` (S8-D1, folded from `feat-dr1-s8-saved-page.md` at #186's merge).
 */
const GATE_EXEMPT_EXACT_PATHS: readonly string[] = ["/api/rpc/animals/cardsByIds"];

export function isGateExemptExactPath(pathname: string): boolean {
  return GATE_EXEMPT_EXACT_PATHS.includes(pathname);
}

/**
 * RL-F1: the per-IP refusal on `/tvaryny` pages (and, since S6, the shelter
 * page under `/prytulky`), which is the rate limit a
 * visitor actually meets on the animal page and the gallery's overlay (the
 * overlay's request is the same URL; Next's router, given a response that
 * isn't its own, loads the URL as a document and gets this). Oleksii,
 * 2026-10-20, verbatim: "gives the rate-limited case its own state on both
 * the full page and the drawer, using the existing «Забагато запитів.
 * Спробуйте ще раз пізніше.». It never shows «Це не помилка…» for a rate
 * limit." So a small Ukrainian page with his sentence, still a 429, not
 * indexed, instead of the English plain text this answered before.
 *
 * The catalogue is imported here, on a refusal only, for the same reason
 * `kabinet/runtime` is imported lazily below: the proxy runs on every
 * request, and its cold start shouldn't parse every message for the rare
 * one that is refused.
 */
async function discoveryRateLimitedResponse(): Promise<NextResponse> {
  const { uk } = await import("@opika/i18n");
  const sentence = uk.detail.rateLimited;
  const html = `<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${sentence}</title></head><body><main><h1>${sentence}</h1></main></body></html>`;
  return new NextResponse(html, {
    status: 429,
    headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex" },
  });
}

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
