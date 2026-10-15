/**
 * What `next build` itself refuses to build without. `next.config.ts` calls
 * `assertBuildEnv(process.env)` at load, which is the moment a Vercel build
 * reads it, so a failure here stops the build before anything compiles.
 *
 * Pure over the environment it is handed (no `process.env` read inside), so
 * the tests call it with plain objects. Every message names the variable and
 * never its value.
 *
 * This is the build half of a pair, not a replacement for the boot half:
 * `validateEnv` (`env.ts`) checks the *server's* environment when an
 * instance starts, which can differ from the build's (a promoted or
 * rolled-back build, a variable changed after the build). Each catches what
 * the other can't.
 */

/** 32 characters, the same floor as the other secrets (`openssl rand -hex 32`). */
export const CRON_SECRET_MIN_LENGTH = 32;

/** The same floor, for every production-only secret below. */
export const PRODUCTION_SECRET_MIN_LENGTH = CRON_SECRET_MIN_LENGTH;

/**
 * The rule a production-only secret follows, so the build check and the boot
 * check (`validateEnv`, `env.ts`) can't drift apart on it: `VERCEL_ENV ===
 * "production"` only, at least 32 characters, a message naming the variable
 * and what breaks without it, never its value. `RATE_LIMIT_KEY_SECRET` has
 * its own, wider gate below (every Vercel deployment).
 */
function productionSecretProblem(
  env: Readonly<Record<string, string | undefined>>,
  name: string,
  withoutIt: string,
): string | null {
  if (env.VERCEL_ENV !== "production") return null;
  if ((env[name] ?? "").length >= PRODUCTION_SECRET_MIN_LENGTH) return null;
  return (
    `${name} must be at least ${PRODUCTION_SECRET_MIN_LENGTH} characters on a production ` +
    `deployment (${withoutIt}) — generate with: ` +
    "openssl rand -hex 32, and set it in Vercel's Production environment"
  );
}

/**
 * `CRON_SECRET` (KH-T6, Oleksii, 2026-10-14: "enforced at build time (a
 * production build fails without CRON_SECRET ≥32 chars) plus the runtime
 * check"): the bearer Vercel sends to the auth clean-up cron
 * (`kabinet/auth-cleanup.ts`), which refuses every call without it. Missing,
 * the cron fails closed on every run with nothing red on the site, and the
 * /pro promise that expired sign-in records go within two days would be false
 * silently.
 *
 * `VERCEL_ENV === "production"` only: Vercel runs crons on production
 * deployments only, so a Preview has no caller for it, and a local or CI
 * `next build` (neither sets `VERCEL_ENV`) never deploys.
 */
export const cronSecretProblem = (env: Readonly<Record<string, string | undefined>>) =>
  productionSecretProblem(
    env,
    "CRON_SECRET",
    "the auth clean-up cron refuses every call without it",
  );

/**
 * Whether this environment is a Vercel deployment (Production, Preview, or
 * any environment Vercel names other than `development`). `vercel env pull`
 * writes `VERCEL=1` and `VERCEL_ENV=development` into a developer's
 * `.env.local`, and `next dev` then reads them, so `development` is the one
 * value treated as local. Anything else Vercel sets, an unrecognised value
 * included, counts as a deployment: fail closed, the same posture as
 * `productionSignInOf`'s unidentified environment.
 */
export const isVercelDeployment = (env: Readonly<Record<string, string | undefined>>): boolean =>
  Boolean(env.VERCEL || env.VERCEL_ENV) && env.VERCEL_ENV !== "development";

/**
 * `RATE_LIMIT_KEY_SECRET` (Oleksii, 2026-10-14, inbox EM-Q11, verbatim:
 * "Rate-limit keys become HMAC(IP) with a dedicated secret
 * RATE_LIMIT_KEY_SECRET (not LOCATION_HMAC_SECRET), on all limiters including
 * the adopter side. Required in production with a build-time check, like
 * CRON_SECRET."): the key every rate limiter's IP bucket is an HMAC under
 * (`rate-limit-key.ts`), which is what lets /pro say «IP-адреси не
 * зберігаються» of the limiter store as well as the database.
 *
 * Widened 2026-10-15 from production to every Vercel deployment (Oleksii,
 * inbox EM-B6, verbatim: "4. RATE_LIMIT_KEY_SECRET required on every Vercel
 * deployment, including Preview (separate Preview value). Build-time check
 * covers both."). Without it a Preview fell back to a random key per process,
 * so its buckets were per instance and the proxy and the route handlers hashed
 * with different keys: the bootstrap per-IP limit CLAUDE.md requires was
 * multiplied there (review truth.md, finding 1). Off Vercel (local dev, CI,
 * unit tests, the harness's `next start`) `rate-limit-key.ts` still falls back
 * to a per-process random key, never to a value in the repository.
 */
export const rateLimitKeySecretProblem = (
  env: Readonly<Record<string, string | undefined>>,
): string | null => {
  if (!isVercelDeployment(env)) return null;
  if ((env.RATE_LIMIT_KEY_SECRET ?? "").length >= PRODUCTION_SECRET_MIN_LENGTH) return null;
  return (
    `RATE_LIMIT_KEY_SECRET must be at least ${PRODUCTION_SECRET_MIN_LENGTH} characters on every ` +
    "Vercel deployment, Preview included (every rate limiter keys a client IP as an HMAC under " +
    "it, so no IP is ever stored) — generate with: openssl rand -hex 32, and set it in Vercel's " +
    "Production and Preview environments, a separate value on each"
  );
};

/**
 * Throws, naming every problem at once, if this build must not go ahead.
 *
 * `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` (H1) is gated on `VERCEL`/`VERCEL_ENV`,
 * any Vercel build: it is inlined into the client bundle at build time, so
 * no later check can repair a bundle built without it. `next.config.ts`'s
 * comment above the call has the full account. `CRON_SECRET` is
 * production-only and `RATE_LIMIT_KEY_SECRET` every Vercel deployment, above.
 */
export function assertBuildEnv(env: Readonly<Record<string, string | undefined>>): void {
  const problems: string[] = [];
  if ((env.VERCEL || env.VERCEL_ENV) && !env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL) {
    problems.push(
      "Missing required environment variable: NEXT_PUBLIC_R2_PUBLIC_BASE_URL — " +
        "set it in Vercel's Production and Preview environments before building. " +
        "See docs/h1-decisions.md.",
    );
  }
  for (const problem of [cronSecretProblem(env), rateLimitKeySecretProblem(env)]) {
    if (problem !== null) {
      problems.push(`Invalid or missing required environment variable: ${problem}`);
    }
  }
  if (problems.length > 0) throw new Error(problems.join("\n"));
}
