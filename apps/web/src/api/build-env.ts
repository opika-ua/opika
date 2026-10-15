import { signInEnvProblems } from "../kabinet/sign-in-env";
import { envValueOf, paddedValueMessage } from "./env-value";

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
 * The one rule every secret below is read by, at build and at boot alike
 * (`envValueOf`, WI-Q1's whitespace note): blank counts as missing, a value
 * with a space or a line break around it is refused as such, and only an
 * exact value of 32 characters or more passes. Each variable has one function
 * built on it, and `assertBuildEnv` and `validateEnv` (`env.ts`) call the same
 * one, so a value can't pass one check and fail the other. Messages name the
 * variable and never its value.
 */
function secretProblem(
  env: Readonly<Record<string, string | undefined>>,
  name: string,
  tooShort: string,
): string | null {
  const value = envValueOf(env, name);
  if (value.kind === "padded") return paddedValueMessage([name]);
  if (value.kind === "set" && value.value.length >= PRODUCTION_SECRET_MIN_LENGTH) return null;
  return tooShort;
}

/**
 * The rule a production-only secret follows: `VERCEL_ENV === "production"`
 * only, then `secretProblem`. `RATE_LIMIT_KEY_SECRET` has its own, wider gate
 * below (every Vercel deployment).
 */
function productionSecretProblem(
  env: Readonly<Record<string, string | undefined>>,
  name: string,
  withoutIt: string,
): string | null {
  if (env.VERCEL_ENV !== "production") return null;
  return secretProblem(
    env,
    name,
    `${name} must be at least ${PRODUCTION_SECRET_MIN_LENGTH} characters on a production ` +
      `deployment (${withoutIt}) — generate with: ` +
      "openssl rand -hex 32, and set it in Vercel's Production environment",
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
 * `LOCATION_HMAC_SECRET` (RG-Q10, Oleksii, verbatim: "the invite PR adds it to
 * the required prod env schema"): the key the registry fuzzes a shelter's
 * public location with on create and on an address change. Joined with the
 * commit that turns production sign-in on, after Oleksii set it in Vercel
 * Production and `location:verify --prod` reported 0 mismatches (2026-10-15).
 * Production only: a Preview never signs in, so it never reaches the
 * registry. Without it the registry answers 503
 * (`app/api/kabinet/[...rpc]/route.ts`); with sign-in live that is the
 * operator's own screen failing.
 *
 * Checked at build and at boot (WI-T2, Oleksii, 2026-10-15: "yes, check
 * LOCATION_HMAC_SECRET at the production build too"), through this one
 * function, like `CRON_SECRET`. Boot alone let a bad key deploy and then
 * refuse to boot, taking the whole public site down with it (review of the
 * wiring commit, finding 2); a failed build leaves the previous deployment
 * live instead.
 */
export const locationSecretProblem = (
  env: Readonly<Record<string, string | undefined>>,
): string | null => {
  if (env.VERCEL_ENV !== "production") return null;
  // Never "generate one": a new key would mismatch every location already
  // fuzzed with the operator's (RG-Q10; `location:verify` checks it).
  return secretProblem(
    env,
    "LOCATION_HMAC_SECRET",
    `LOCATION_HMAC_SECRET must be at least ${PRODUCTION_SECRET_MIN_LENGTH} characters on a ` +
      "production deployment (the registry fuzzes shelter locations with it) — set it in Vercel's " +
      "Production environment to the same value the onboarding script uses, never a new one",
  );
};

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
  return secretProblem(
    env,
    "RATE_LIMIT_KEY_SECRET",
    `RATE_LIMIT_KEY_SECRET must be at least ${PRODUCTION_SECRET_MIN_LENGTH} characters on every ` +
      "Vercel deployment, Preview included (every rate limiter keys a client IP as an HMAC under " +
      "it, so no IP is ever stored) — generate with: openssl rand -hex 32, and set it in Vercel's " +
      "Production and Preview environments, a separate value on each",
  );
};

/**
 * `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` (H1), the value rule only: the build asks
 * it of every Vercel build (`assertBuildEnv`, below: it is inlined into the
 * client bundle, so no later check can repair a bundle built without it), the
 * boot of every production instance (`validateEnv`, the harness's `next start`
 * included). Two gates, one rule, so a padded or blank value fails both.
 */
export const r2PublicBaseUrlProblem = (
  env: Readonly<Record<string, string | undefined>>,
): string | null => {
  const value = envValueOf(env, "NEXT_PUBLIC_R2_PUBLIC_BASE_URL");
  if (value.kind === "set") return null;
  if (value.kind === "padded") return paddedValueMessage(["NEXT_PUBLIC_R2_PUBLIC_BASE_URL"]);
  return (
    "Missing required environment variable: NEXT_PUBLIC_R2_PUBLIC_BASE_URL — " +
    "set it in Vercel's Production and Preview environments before building. " +
    "See docs/h1-decisions.md."
  );
};

/**
 * Throws, naming every problem at once, if this build must not go ahead.
 *
 * `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` (H1) is gated on `VERCEL`/`VERCEL_ENV`,
 * any Vercel build: it is inlined into the client bundle at build time, so
 * no later check can repair a bundle built without it. `next.config.ts`'s
 * comment above the call has the full account. `CRON_SECRET` and
 * `LOCATION_HMAC_SECRET` are production-only and `RATE_LIMIT_KEY_SECRET` every
 * Vercel deployment, above. Each is the same function the boot check calls.
 *
 * The sign-in variables (IN-R2, Decision 1, Oleksii, verbatim: "From the
 * commit that turns sign-in on: A production build fails if any of the five
 * variables is missing, so a bad deploy never goes live.") are
 * `signInEnvProblems` (`kabinet/sign-in-env.ts`), production only, shared with
 * the boot check (`validateEnv`) so the two can't drift; which variables and
 * why are on that function.
 */
export function assertBuildEnv(env: Readonly<Record<string, string | undefined>>): void {
  const problems: string[] = [];
  const r2 = env.VERCEL || env.VERCEL_ENV ? r2PublicBaseUrlProblem(env) : null;
  if (r2 !== null) problems.push(r2);
  for (const problem of [
    cronSecretProblem(env),
    rateLimitKeySecretProblem(env),
    locationSecretProblem(env),
  ]) {
    if (problem !== null) {
      problems.push(`Invalid or missing required environment variable: ${problem}`);
    }
  }
  problems.push(...signInEnvProblems(env));
  if (problems.length > 0) throw new Error(problems.join("\n"));
}
