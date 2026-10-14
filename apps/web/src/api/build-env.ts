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
 * `next build` (neither sets `VERCEL_ENV`) never deploys. Shared by the build
 * check below and `validateEnv`, so the two can't drift apart on the rule.
 */
export function cronSecretProblem(
  env: Readonly<Record<string, string | undefined>>,
): string | null {
  if (env.VERCEL_ENV !== "production") return null;
  if ((env.CRON_SECRET ?? "").length >= CRON_SECRET_MIN_LENGTH) return null;
  return (
    `CRON_SECRET must be at least ${CRON_SECRET_MIN_LENGTH} characters on a production ` +
    "deployment (the auth clean-up cron refuses every call without it) — generate with: " +
    "openssl rand -hex 32, and set it in Vercel's Production environment"
  );
}

/**
 * Throws, naming every problem at once, if this build must not go ahead.
 *
 * `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` (H1) is gated on `VERCEL`/`VERCEL_ENV`,
 * any Vercel build: it is inlined into the client bundle at build time, so
 * no later check can repair a bundle built without it. `next.config.ts`'s
 * comment above the call has the full account. `CRON_SECRET` is
 * production-only, above.
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
  const cron = cronSecretProblem(env);
  if (cron !== null) problems.push(`Invalid or missing required environment variable: ${cron}`);
  if (problems.length > 0) throw new Error(problems.join("\n"));
}
