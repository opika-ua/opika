import { z } from "zod";
import { photoUploadEnvProblem } from "../kabinet/photo-upload-env";
import { r2CleanupEnvProblem } from "../kabinet/r2-cleanup-env";
import { signInEnvProblems } from "../kabinet/sign-in-env";
import {
  cronSecretProblem,
  locationSecretProblem,
  r2PublicBaseUrlProblem,
  rateLimitKeySecretProblem,
} from "./build-env";

/**
 * Read a required environment variable, throwing at call time if missing.
 *
 * Call this per-request (or lazily on first request), never at the top level
 * of a route module: `next build` imports route modules to collect page data,
 * so module scope runs at build time and a top-level call would make a
 * deployment secret a build-time requirement. The throw then becomes a 500,
 * which is the correct behaviour for a missing deployment secret.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Every secret this app's production runtime reads, in one place.
 *
 * `requireEnv` above already throws with no fallback wherever it's called -
 * the gap it can't close on its own is *when*: it only fires the first time
 * a request happens to reach a code path that calls it. `gallery.list` uses
 * `OFFSET` pagination and never touches `CURSOR_HMAC_SECRET` at all, so a
 * deploy missing it would build cleanly, serve the gallery correctly, and
 * only 500 the first time someone opens the deck or a reveal - discovered by
 * a real visitor, not by the deploy itself. This schema is the single
 * manifest `validateEnv` checks as a whole, so a missing secret fails before
 * the instance accepts its first request, all missing names at once, not
 * one 500 per handler as each is separately discovered.
 *
 * `LOCATION_HMAC_SECRET` joined the required production environment with the commit that turns
 * production sign-in on (RG-Q10, Oleksii, verbatim: "the invite PR adds it to
 * the required prod env schema"). Until then it was deliberately kept out:
 * the onboarding script (`packages/db/src/onboard-shelter.ts`) runs from an
 * operator's own machine, and no request path of this app read the key.
 * Since the registry PR one does: `registry.shelters.create` and address
 * changes recompute a shelter's public location with it, and the registry
 * answers 503 without it (`app/api/kabinet/[...rpc]/route.ts`). With sign-in
 * live the operator can reach those procedures, so a production instance
 * without the key now refuses to boot rather than serving a registry that
 * 503s. Rollout order (RG-Q10): Oleksii set it in Vercel Production (the same
 * value as the onboarding script's) and `location:verify --prod` reported 0
 * mismatches (2026-10-15) before this entry landed. 32 characters, the floor
 * `productionLocationPolicy` itself enforces. Rotating it is not a config
 * change: every shelter's public location is recomputed in one migration
 * (RG-Q10).
 *
 * It is checked by `locationSecretProblem` (`build-env.ts`) in `validateEnv`
 * below and in the production build (WI-T2), not by this schema: this schema
 * applies to every `NODE_ENV=production` instance, Previews included, and a
 * Preview never signs in (IN-R2), so it never reaches the registry and holds
 * no copy of the key (Oleksii set it in Production only).
 * `VERCEL_ENV === "production"` only, like `CRON_SECRET`.
 *
 * `PRELAUNCH_GATE_SECRET` (2026-09-13) follows `CURSOR_HMAC_SECRET`'s pattern:
 * `proxy.ts` reads it on every single request
 * while `SITE_IS_PUBLICLY_DISCOVERABLE` is false, which today is every
 * request this app serves - an instance that booted without it would 500
 * or, worse, silently deny every visitor with no way to open the gate at
 * all. Required here rather than only where it's read, for the same reason
 * every other secret in this schema is: fail at boot, not on the first
 * request that happens to need it. Comes back out of this schema in the
 * same change that removes the gate itself (`docs/build-plan.md`'s launch
 * gate - the gate comes down in the same change that flips
 * `SITE_IS_PUBLICLY_DISCOVERABLE`), not left behind as a requirement
 * nothing reads anymore.
 *
 * **This is a bot shutter, not a security boundary - see
 * `apps/web/src/api/prelaunch-gate.ts`'s own top comment for what it does
 * and does not protect.** The 32-character floor below is not because the
 * value is precious; it's the same reasoning Oleksii gave for it directly:
 * "a short gate is guessable by exactly the traffic it exists to stop."
 * Generated the same way as every other secret in this schema:
 * `openssl rand -hex 32`.
 *
 * ⚠ **Deploy-order note, same class of risk as `NEXT_PUBLIC_R2_PUBLIC_BASE_URL`'s
 * own entry below.** Because this is read on every request rather than only
 * a DB-backed one, a Production *or Preview* instance deployed before
 * `PRELAUNCH_GATE_SECRET` exists in Vercel's dashboard does not fail one
 * handler - it 500s on its very first request and stays that way, with no
 * page left to open the gate from at all. Set it in Vercel, **both
 * Production and Preview, the same value on both**, before this branch
 * deploys - Oleksii's own instruction, 2026-09-13. Preview currently has no
 * `DATABASE_URL` and cannot serve a DB-backed page regardless, so gating it
 * changes nothing about what Preview can do today - it costs nothing now
 * and covers the case where Preview later gets its own Neon branch and
 * starts serving real pages.
 *
 * `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` (H1) is checked beside this schema, not in
 * it, through `r2PublicBaseUrlProblem` (`build-env.ts`), the rule the build
 * applies too (WI-Q1's whitespace note), on every production instance as
 * before. It is genuinely required by this app's
 * own runtime, not just by the operator's onboarding script. Every real animal photo routes
 * through `apps/web/src/image-loader.ts`, which throws without it the
 * moment a real (non-seed-placeholder) `storageKey` needs a URL - see that
 * file's own comment. The onboarding script's R2 *write* credentials
 * (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`) still belong to
 * `onboard-shelter.ts`'s own operator-local run, never to Vercel. Since PR 3
 * one request path does write to R2: `shelter.photos.add` (K-Q2, Oleksii's
 * explicit decision overriding the earlier "no R2 write credentials in the
 * deployed app" rule), with its own token
 * (`R2_UPLOAD_ACCESS_KEY_ID`, `R2_UPLOAD_SECRET_ACCESS_KEY`, plus
 * `R2_ACCOUNT_ID` and `R2_BUCKET_NAME`), in Vercel Production only (P-Q10).
 * Those are checked by `photoUploadEnvProblem` below and in the production
 * build, `VERCEL_ENV === "production"` only, like `CRON_SECRET`: a Preview
 * never holds the token and refuses every upload with a typed error.
 *
 * ⚠ Checking it at boot is a real check, but not the one that actually protects
 * the client - found by inspecting a built client bundle, not assumed.
 * `NEXT_PUBLIC_*` values are inlined into the client bundle at *build*
 * time; the boot check runs against the *server's* live
 * `process.env` at *boot*. Those can disagree: a promoted or rolled-back
 * build, or any build job that doesn't forward this var (`next.config.ts`
 * carries the actual load-bearing check, gated on `process.env.VERCEL`,
 * for exactly this reason), ships a client bundle that throws on hydration
 * for any real photo, on a server instance whose own `validateEnv()` still
 * passes cleanly - the server-side env is fine, the frozen bundle isn't.
 * The boot check still earns its place: it's what turns "some request 500s"
 * into "every request 500s, from boot," for the server-rendered half of
 * every page, which is real signal even though it can't see the client
 * bundle's own baked-in value. Deploy-order note: this one needed
 * `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` set in Vercel (Production and Preview) *before* the first build
 * after this entry landed, not after. See `docs/h1-decisions.md`.
 *
 * The Upstash rate-limiter credentials (Phase 3, block 4,
 * `docs/handoff-2026-10-04.md` §3 - either `KV_REST_API_URL`/
 * `KV_REST_API_TOKEN`, from Vercel's own Storage marketplace integration,
 * or `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`, Upstash's own
 * naming) are **deliberately not in this schema** - see `validateEnv()`'s
 * own comment below for why they need a different gate than
 * `NODE_ENV === "production"` alone, and `apps/web/src/api/rate-limit.ts`'s
 * own doc comment for what happens when they're missing (a silent, not a
 * thrown, fallback).
 */
const RequiredProductionEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  CURSOR_HMAC_SECRET: z.string().min(1, "CURSOR_HMAC_SECRET is required"),
  PRELAUNCH_GATE_SECRET: z
    .string()
    .min(
      32,
      "PRELAUNCH_GATE_SECRET must be at least 32 characters - generate with: openssl rand -hex 32",
    ),
});

/**
 * Validates every secret this app's production runtime needs, throwing one
 * error naming everything missing rather than waiting for each handler to
 * discover its own gap separately.
 *
 * Called once from `instrumentation.ts`'s `register()`, which Next.js runs
 * before a server instance accepts its first request - see that file's own
 * comment for why this is the one place in the app where an eager,
 * boot-time check is both possible and correct without also making `next
 * build` require a runtime secret (`register()` doesn't run during `next
 * build`; `requireEnv`'s own doc comment above is about exactly that
 * build-time hazard, and this function doesn't reintroduce it).
 *
 * Skipped outside production: local dev and CI already fail immediately and
 * clearly (`requireEnv`, per call site) the moment a handler that actually
 * needs a given secret runs, and requiring every production secret just to
 * run `pnpm dev` would block looking at pages that never touch them.
 */
export function validateEnv(): void {
  if (process.env.NODE_ENV !== "production") return;
  const result = RequiredProductionEnvSchema.safeParse(process.env);
  const r2 = r2PublicBaseUrlProblem(process.env);
  if (!result.success || r2 !== null) {
    /**
     * Each schema entry's own message, not `issue.path` alone - every
     * message in `RequiredProductionEnvSchema` already names its own
     * variable, so joining messages loses nothing a bare name would have
     * given. Joining paths instead, as an earlier version of this function
     * did, silently discarded `PRELAUNCH_GATE_SECRET`'s length-floor
     * message: a 20-character value would fail validation and report
     * "Missing required environment variable(s): PRELAUNCH_GATE_SECRET" -
     * true-sounding but wrong, since the operator would find the variable
     * genuinely set in Vercel and have no way to learn *why* boot still
     * refused it. Found by a reviewer's own mutation, not read from the
     * type signature.
     */
    const messages = [
      ...(result.success ? [] : result.error.issues.map((issue) => issue.message)),
      ...(r2 === null ? [] : [r2]),
    ].join("; ");
    throw new Error(`Invalid or missing required environment variable(s): ${messages}`);
  }

  /**
   * Phase 3, block 4 (`docs/handoff-2026-10-04.md` §3) - gated on
   * `process.env.VERCEL`/`VERCEL_ENV` (`next.config.ts`'s own established
   * pattern for this exact class of problem, checked here rather than
   * reused only for symmetry), **not** folded into
   * `RequiredProductionEnvSchema` above. `NODE_ENV === "production"` alone
   * is not "a real Vercel deployment": the Playwright harness's own
   * `webServer` (`playwright.config.ts`) runs `next start`, which sets
   * `NODE_ENV=production`, with no live Upstash account and no intention
   * of ever having one - it must keep using `rate-limit.ts`'s in-memory
   * fallback. Folding these into the schema above would force the harness
   * to supply *some* value to pass validation, and unlike every other
   * entry in that schema (a local secret, never a live external
   * credential), a fake Upstash URL is not merely inert: `apiRateLimiter`
   * would construct a real `Redis` client pointed at a garbage endpoint,
   * and every rate-limited request the harness makes (`/tvaryny`, every
   * `/api/rpc` call) would attempt a real, failing network call instead of
   * using the in-memory limiter the harness actually needs.
   *
   * `apiRateLimiter`'s own construction (`rate-limit.ts`) never throws on
   * a missing credential - it silently falls back to in-memory instead,
   * which is exactly the per-instance behaviour this block exists to stop
   * running in production. This check is what turns that silent fallback
   * into a loud boot failure specifically on a real Vercel deployment,
   * without also demanding a live credential from every local `next
   * start`, including the harness's own.
   */
  /**
   * Two accepted name pairs, not one - see `rate-limit.ts`'s own
   * `apiRateLimiter` comment for the full "why two naming conventions"
   * account (confirmed against this project's real Vercel provisioning,
   * not assumed). This check and that file's own pair-resolution read the
   * identical two pairs in the identical preference order, deliberately
   * kept in sync rather than each inventing its own account of the same
   * fact.
   */
  const hasKvCredentials =
    Boolean(process.env.KV_REST_API_URL) && Boolean(process.env.KV_REST_API_TOKEN);
  const hasUpstashCredentials =
    Boolean(process.env.UPSTASH_REDIS_REST_URL) && Boolean(process.env.UPSTASH_REDIS_REST_TOKEN);

  if (
    (process.env.VERCEL || process.env.VERCEL_ENV) &&
    !hasKvCredentials &&
    !hasUpstashCredentials
  ) {
    throw new Error(
      "Invalid or missing required environment variable(s): either KV_REST_API_URL + " +
        "KV_REST_API_TOKEN (Vercel's Upstash integration) or UPSTASH_REDIS_REST_URL + " +
        "UPSTASH_REDIS_REST_TOKEN (Upstash's own naming) must both be set on a real Vercel " +
        "deployment - set them in Production and Preview before the next deploy.",
    );
  }

  /**
   * `CRON_SECRET` (KH-Q9/KH-T6, 2026-10-14): a production deployment refuses
   * to boot without one of 32+ characters, the same "fail at boot, not on
   * the first request" rule as every secret above. The rule itself
   * (production only, the floor, the message) is `cronSecretProblem` in
   * `build-env.ts`, shared with the build-time check in `next.config.ts`:
   * the build checks the build's environment, this checks the server's,
   * and either can differ from the other.
   *
   * `VERCEL_ENV === "production"` only, not `VERCEL`/any `VERCEL_ENV` like
   * the Upstash check: Vercel runs crons on production deployments only, so
   * a Preview has no caller for it, and the harness's `next start` sets
   * neither.
   *
   * ⚠ Deploy-order note: set `CRON_SECRET` in Vercel's Production
   * environment before this deploys, or the production build fails.
   */
  /**
   * `RATE_LIMIT_KEY_SECRET` (EM-Q11, 2026-10-14) goes through the rule the
   * build check uses too (`rateLimitKeySecretProblem`, `build-env.ts`), but
   * on every Vercel deployment, Preview included (EM-B6, 2026-10-15), not
   * production only like `CRON_SECRET`. Without it every limiter call on such
   * an instance throws (`rate-limit-key.ts` fails closed there), so refusing
   * to boot is the same outcome, found before the first visitor rather than
   * by them.
   *
   * ⚠ Deploy-order note: set it in Vercel's Production environment (Oleksii,
   * 2026-10-14: "already set") and in Preview, a separate value, before this
   * deploys, or a Preview build fails.
   */
  /**
   * The sign-in variables (IN-R2, Decision 1, verbatim: "Keep the runtime boot
   * check as a second guard."): the same rule the build applies
   * (`signInEnvProblems`, `kabinet/sign-in-env.ts`), against the server's own
   * environment, production only. A production instance whose variables
   * would leave sign-in off refuses to boot, rather than serving a 503 nobody
   * sees until a shelter writes.
   */
  const problems = [
    cronSecretProblem(process.env),
    rateLimitKeySecretProblem(process.env),
    locationSecretProblem(process.env),
    photoUploadEnvProblem(process.env),
    r2CleanupEnvProblem(process.env),
    ...signInEnvProblems(process.env),
  ].filter((problem): problem is string => problem !== null);
  if (problems.length > 0) {
    throw new Error(`Invalid or missing required environment variable(s): ${problems.join("; ")}.`);
  }
}
