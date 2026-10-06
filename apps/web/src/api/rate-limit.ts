import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ---------------------------------------------------------------------------
// Generic per-IP rate limiter
// ---------------------------------------------------------------------------

/**
 * Interface for a rate limiter. `check` is async because the production
 * implementation (`upstashRateLimiter`, below) is a network call over
 * Upstash's REST API — there is no synchronous way to ask a shared,
 * cross-instance store anything. `inMemoryRateLimiter`'s own `check` has
 * nothing to await, but still returns a `Promise<boolean>` so both
 * implementations satisfy one interface and a caller never needs to know
 * which one it's holding.
 *
 * Deliberately has no *unconditional* dependency on `@opika/db` or anything
 * else Node-only — this module is imported from `apps/web/src/proxy.ts`,
 * which runs in a separate deployment unit from the HTTP route handlers. A
 * Postgres driver import here would make that bundle needlessly heavier at
 * best, and fail to bundle at worst; the DB-dependent reveal limiter lives
 * in its own file (`reveal-rate-limit.ts`) for exactly this reason.
 * `@upstash/redis` is REST-based (plain `fetch`, no TCP socket), which is
 * why it's safe to import from both deployment units the same way
 * `@neondatabase/serverless` is safe on the DB side (`client.ts`'s own
 * comment) — this is not the same class of risk `@opika/db` itself is.
 *
 * Does NOT take `now` as an explicit parameter the way this codebase's
 * other pure functions do (`docs/standing-constraints.md`'s "`now` is a
 * parameter"). This is a deliberate, documented exception, not an
 * oversight: `@upstash/ratelimit`'s sliding-window algorithm runs as a Lua
 * script on the Redis server itself and reads the server's own clock —
 * there is no parameter on its `limit()` call this adapter could thread a
 * caller-supplied `now` through even if it wanted to. `check`'s `now`
 * parameter stays on the interface (both implementations still accept it)
 * so call sites don't need to know which backing store they're calling
 * into, but `upstashRateLimiter` silently ignores its value — callers
 * needing deterministic, injectable time for a rate-limit decision (none
 * exist in this codebase today) cannot get it from this implementation.
 */
export interface RateLimiter {
  /** Resolves true if the request is allowed, false if rate-limited. */
  check(key: string, now: Date): Promise<boolean>;
}

type SlidingWindowEntry = { timestamps: number[] };

/**
 * In-memory sliding-window rate limiter.
 *
 * IMPORTANT: This does not survive serverless cold starts. Each instance
 * maintains its own counter, so the effective limit in production is
 * (limit × number_of_instances). Used for local dev, CI, and the harness —
 * `apiRateLimiter` below only ever falls back to this when no Upstash
 * credentials are configured, which is true everywhere except a real
 * Vercel deployment.
 */
export function inMemoryRateLimiter(opts: { windowMs: number; maxRequests: number }): RateLimiter {
  const store = new Map<string, SlidingWindowEntry>();

  return {
    async check(key: string, now: Date): Promise<boolean> {
      const nowMs = now.getTime();
      const cutoff = nowMs - opts.windowMs;

      let entry = store.get(key);
      if (!entry) {
        entry = { timestamps: [] };
        store.set(key, entry);
      }

      // Evict expired timestamps
      entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

      if (entry.timestamps.length >= opts.maxRequests) {
        return false;
      }

      entry.timestamps.push(nowMs);
      return true;
    },
  };
}

/**
 * Phase 3, block 4 (launch-gate infra, `docs/handoff-2026-10-04.md` §3) —
 * the shared-store replacement `inMemoryRateLimiter`'s own doc comment has
 * been calling for since this file was written. `@upstash/ratelimit`
 * (not the lower-level `@upstash/redis` alone) is Upstash's own official,
 * purpose-built rate-limiting SDK: a tested sliding-window Lua script
 * against a shared store, rather than this codebase hand-rolling the same
 * algorithm again in application code — `pnpm-workspace.yaml`'s own catalog
 * comment has the full "why this dependency" account.
 *
 * `windowMs` is **rounded** (not truncated — found as a real bug by Tier 1
 * review, not merely a wording slip) to whole seconds for `Ratelimit.
 * slidingWindow`'s duration-string argument (`"60 s"`), floored at 1 second:
 * `Math.round` alone sends any window under 500ms to `"0 s"`, which the
 * library's own Lua script divides by — confirmed by reading
 * `@upstash/ratelimit`'s source, not assumed. Sub-second windows aren't a
 * real requirement anywhere this is called today, so the floor is a safe
 * guard rather than a feature; a caller that actually needed sub-second
 * precision would need a different algorithm choice, not a formatting fix.
 *
 * **Not an exact sliding-window log, unlike `inMemoryRateLimiter` above —
 * found by reading `@upstash/ratelimit`'s own implementation, not assumed
 * equivalent.** The library's sliding-window algorithm is a weighted
 * two-bucket approximation (current + previous fixed window, weighted by
 * elapsed fraction), not a per-timestamp log the way the in-memory
 * implementation is. Worst case this can admit roughly 2x `maxRequests`
 * within a rolling window, concentrated at a window-boundary — "100/min"
 * in every comment in this file describing the Upstash-backed limiter
 * means "Upstash's own approximation of 100/min," not an exact count the
 * way the in-memory implementation's own 100/min is.
 *
 * `prefix` namespaces keys in the shared Redis store so this limiter's
 * counters can never collide with a *different* limiter's keys that happen
 * to reuse the same client (e.g. a future second rate-limited surface
 * sharing one Upstash database) — `@upstash/ratelimit` already prefixes
 * every key with `@upstash/ratelimit` internally, and this adds one more
 * level specific to *which* limiter instance, not a workaround for a gap
 * in the library's own default. `apiRateLimiter`, below, further
 * namespaces by deploy target (Production vs. Preview) — RL-3
 * (`docs/decisions-inbox/feat-rate-limiter-shared-store.md`), resolved:
 * Oleksii accepted the recommendation of one Upstash database with two
 * prefixes over two separate databases.
 *
 * **Fails closed on a store error or a slow store, with a bounded
 * timeout — RL-1, resolved (Oleksii accepted the recommendation).** Two
 * distinct failure shapes, found to need two distinct fixes by reading
 * `@upstash/ratelimit`'s own source rather than assuming one fix covers
 * both, and corrected once more by a second Tier 1 review round that
 * exercised the real library against a real (if deliberately unreachable)
 * endpoint rather than trusting the first round's reasoning about which
 * shape goes where:
 *   1. **An outright, fast failure** (DNS failure, connection refused, a
 *      bad-auth response) — `ratelimit.limit()` *rejects*. The caller of
 *      this function passes a `Redis` client built with `retry: { retries:
 *      0 }` (`apiRateLimiter`, below) specifically so this is fast — the
 *      client's own default (5 retries, exponential backoff) would
 *      otherwise spend several seconds retrying a connection that's
 *      already failed before this even reaches the `timeout` option below,
 *      during which every *other* concurrent request fans out its own
 *      retry storm against a store that's already down. Caught explicitly
 *      below, logged for observability, and resolved to `false`.
 *   2. **A genuinely slow, not-yet-failing request** — `@upstash/
 *      ratelimit`'s own `timeout` option (default 5000ms, set to
 *      `UPSTASH_CHECK_TIMEOUT_MS` below) races its own internal promise and
 *      *resolves* `{ success: true, reason: "timeout" }` when it fires —
 *      the library's own default behaviour is to **fail open** on a
 *      timeout ("allow requests to pass... in case of network problems",
 *      its own doc comment), the opposite of RL-1's decision. `reason ===
 *      "timeout"` is checked explicitly below and overridden to `false`
 *      (also logged — found missing by the second review round: a request
 *      that resolves instead of rejecting was silently denied with no
 *      observability at all, which is still a real degraded-service event
 *      worth logging even though it isn't an outright error).
 * Both paths resolve `false` (deny) rather than rejecting, so neither
 * `proxy.ts` nor the `/api/rpc` route handler needs its own error
 * handling for this — a limiter that can't reach its store denies by
 * design now, not by an uncaught exception bubbling up as a 500.
 */
const UPSTASH_CHECK_TIMEOUT_MS = 1_000;

export function upstashRateLimiter(opts: {
  redis: Redis;
  windowMs: number;
  maxRequests: number;
  prefix: string;
}): RateLimiter {
  const windowSeconds = Math.max(1, Math.round(opts.windowMs / 1000));
  const ratelimit = new Ratelimit({
    redis: opts.redis,
    limiter: Ratelimit.slidingWindow(opts.maxRequests, `${windowSeconds} s`),
    prefix: opts.prefix,
    timeout: UPSTASH_CHECK_TIMEOUT_MS,
  });

  return {
    async check(key: string, _now: Date): Promise<boolean> {
      try {
        const result = await ratelimit.limit(key);
        if (result.reason === "timeout") {
          console.error("apiRateLimiter: Upstash check timed out — failing closed (RL-1)");
          return false;
        }
        return result.success;
      } catch (err) {
        console.error("apiRateLimiter: Upstash check failed — failing closed (RL-1)", err);
        return false;
      }
    },
  };
}

/**
 * Default API rate limiter: 100 requests per minute per IP.
 *
 * **Upstash-backed whenever a URL/token pair is set — the in-memory
 * fallback otherwise.** Reads `KV_REST_API_URL`/`KV_REST_API_TOKEN` first,
 * falling back to `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` —
 * **not a guess, confirmed against this project's own real Vercel
 * provisioning**: connecting Upstash for Redis through Vercel's Storage
 * marketplace integration (the path this project actually used) names the
 * injected variables `KV_REST_API_URL`/`KV_REST_API_TOKEN` — Vercel's
 * legacy "Vercel KV" naming, kept for backward compatibility with the
 * `@vercel/kv` package, even though the underlying store is plain Upstash
 * Redis. `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` (Upstash's own
 * naming, and `Redis.fromEnv()`'s default) is kept as a fallback for
 * whoever connects the store a different way (Upstash's own dashboard, a
 * manually-set env var) — both name pairs point at the same kind of
 * credential, just from two different provisioning paths.
 *
 * A plain presence check at module scope, not `requireEnv` (which throws):
 * this module is imported from `apps/web/src/proxy.ts`, which Next.js
 * evaluates at build time to collect route metadata, same build-time-secret
 * hazard `env.ts`'s own `requireEnv` doc comment describes for route
 * handlers — a hard-required Upstash credential here would make `next
 * build` itself depend on a deployment secret. Local dev, CI, and the
 * Playwright harness have no Upstash credentials at all and fall back to
 * the in-memory limiter exactly as they did before this row; only a real
 * deployment with a URL/token pair set gets the shared store.
 * `validateEnv()` (`env.ts`) separately *requires* one of the two pairs on
 * a real Vercel deployment — Production **and Preview**, not "production"
 * in the `NODE_ENV` sense — at boot.
 *
 * **Correction, Tier 1 review:** that boot check only proves both variables
 * are *present*, not that they're *valid* — a revoked or mistyped token
 * passes `validateEnv()` cleanly and then fails at the first real request.
 * `upstashRateLimiter`'s own RL-1 handling (above) is what that first real
 * request then falls back on: fails closed, bounded, and logged, rather
 * than 500ing. "Refuses to start" is therefore true only for the
 * missing-variable case, not the wrong-variable one — a stronger claim
 * than this schema check can actually back, and a previous version of
 * this comment overstated it.
 *
 * **Operational hazard, flagged by Tier 1 review:** `vercel env pull`
 * writes `VERCEL=1` into the local `.env.local` it generates, which `next
 * start` loads the same as any other `.env.local`. Running that command
 * locally (e.g. to sync other Vercel-managed secrets) would silently flip
 * a local `next start` into believing it's a real Vercel deployment and
 * require working Upstash credentials for `validateEnv()` to pass — the
 * opposite problem from the harness's own, and one a `.env.local` diff
 * review would catch before it causes confusion.
 *
 * Previously imported from two independent entry points — the `/api/rpc`
 * route handler and `proxy.ts`, separate Vercel deployment units with
 * separate module graphs — and each held its *own* in-memory `Map`,
 * meaning the real ceiling for one IP was double the stated limit (100/min
 * through each path, 200/min combined). The Upstash-backed instance closes
 * that gap for real for the first time: both deployment units construct
 * their own `Ratelimit` object, but both point at the same Redis keys
 * (same `prefix`, same account), so the budget is genuinely shared now,
 * not merely configured identically. The in-memory fallback still has the
 * old double-budget gap — unavoidable without a shared store, which is
 * exactly why dev/test never needed one before now.
 *
 * **Prefix includes `VERCEL_ENV` — RL-3, resolved (Oleksii accepted the
 * recommendation of one Upstash database, two prefixes, over provisioning
 * two separate databases).** RL-4 confirmed one database, connected to both
 * Production and Preview — without this prefix, the two would share one
 * Redis key per IP on that one database, meaning a preview-URL visitor
 * (manual QA, the rehearsal, anyone poking at a preview deploy) spends the
 * same budget a real adopter on Production does, and vice versa. Falls
 * back to the literal string `"unknown"` rather than `undefined`
 * (`Ratelimit`'s own `prefix` option is typed `string`, not optional) for
 * the one path that can reach this line with `VERCEL_ENV` unset: a real
 * Vercel deployment always sets it (Production, Preview, or Development),
 * so `"unknown"` is reachable only if Vercel's own documented behaviour
 * ever changed — a safe, inert fallback rather than a crash, not a
 * realistic case this needs to handle gracefully for any other reason.
 *
 * **Picks a complete pair as a unit, never cross-matching fields from the
 * two naming conventions — a real bug found by this file's own test
 * suite, not merely a defensive guess.** An earlier version resolved the
 * URL and token independently (`KV_URL || UPSTASH_URL`, `KV_TOKEN ||
 * UPSTASH_TOKEN`), which meant a `KV_REST_API_URL` set alongside a
 * (leftover, unrelated) `UPSTASH_REDIS_REST_TOKEN` silently produced a
 * `Redis` client built from two different accounts' credentials — nonsense
 * that would only surface as a mysterious auth failure against a real
 * store. `env.ts`'s own `hasKvCredentials`/`hasUpstashCredentials` already
 * required a complete, non-cross-matched pair; this now matches that same
 * logic exactly rather than silently disagreeing with it.
 *
 * `||`, not `??`, within each pair's own fallback and for the `VERCEL_ENV`
 * default — deliberately treats an empty string the same as unset. `??`
 * only falls through on `null`/`undefined`, so a variable set to `""`
 * (unusual, but not impossible from a misconfigured deployment script)
 * would otherwise "win" and be treated as present-but-empty. Matches this
 * file's own neighbour, `env.ts`'s `requireEnv`, which already treats
 * `!value` (empty-string included) as missing.
 *
 * `retry: { retries: 0 }` on the `Redis` client itself — a second Tier 1
 * review round's finding: `@upstash/redis`'s own default is 5 retries with
 * exponential backoff, which during a genuine outage means every single
 * incoming request fans out up to 6 attempts against a store that's
 * already failing, and delays the moment a connection failure actually
 * rejects well past `UPSTASH_CHECK_TIMEOUT_MS` — the 1-second bound RL-1
 * exists to guarantee stops meaning much if the client itself spends
 * several seconds retrying underneath it. With retries disabled, an
 * outright failure (DNS, connection refused, bad auth) rejects fast and
 * lands in `upstashRateLimiter`'s own `catch` — logged, exactly the
 * observability RL-1 calls for — rather than silently racing the SDK's own
 * `timeout` option to a close no one can see happen.
 */
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const UPSTASH_NATIVE_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_NATIVE_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const [RESOLVED_REDIS_URL, RESOLVED_REDIS_TOKEN]: [string, string] | [undefined, undefined] =
  KV_URL && KV_TOKEN
    ? [KV_URL, KV_TOKEN]
    : UPSTASH_NATIVE_URL && UPSTASH_NATIVE_TOKEN
      ? [UPSTASH_NATIVE_URL, UPSTASH_NATIVE_TOKEN]
      : [undefined, undefined];
const VERCEL_ENV = process.env.VERCEL_ENV || "unknown";

export const apiRateLimiter: RateLimiter =
  RESOLVED_REDIS_URL && RESOLVED_REDIS_TOKEN
    ? upstashRateLimiter({
        redis: new Redis({
          url: RESOLVED_REDIS_URL,
          token: RESOLVED_REDIS_TOKEN,
          retry: { retries: 0 },
        }),
        windowMs: 60_000,
        maxRequests: 100,
        prefix: `opika-api-ratelimit-${VERCEL_ENV}`,
      })
    : inMemoryRateLimiter({
        windowMs: 60_000,
        maxRequests: 100,
      });
