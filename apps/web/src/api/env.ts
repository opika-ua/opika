import { z } from "zod";

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
 * `requireEnv` above already throws with no fallback wherever it's called —
 * the gap it can't close on its own is *when*: it only fires the first time
 * a request happens to reach a code path that calls it. `gallery.list` uses
 * `OFFSET` pagination and never touches `CURSOR_HMAC_SECRET` at all, so a
 * deploy missing it would build cleanly, serve the gallery correctly, and
 * only 500 the first time someone opens the deck or a reveal — discovered by
 * a real visitor, not by the deploy itself. This schema is the single
 * manifest `validateEnv` checks as a whole, so a missing secret fails before
 * the instance accepts its first request, all missing names at once, not
 * one 500 per handler as each is separately discovered.
 *
 * `LOCATION_HMAC_SECRET` is still deliberately NOT listed here, even now
 * that `packages/db/src/onboard-shelter.ts` is a real, live caller of
 * `productionLocationPolicy`. That script is not part of this app: it runs
 * from an operator's own machine against Neon's direct connection string,
 * the same way migrations do — never through a Vercel-deployed instance of
 * `apps/web`. Requiring it here would mean the deployed site refuses to
 * boot over a variable it never reads, which is a real, avoidable outage
 * risk (a missing Vercel env var taking the live site down) for no safety
 * benefit `onboard-shelter.ts`'s own check doesn't already provide.
 * `LOCATION_HMAC_SECRET` belongs in the operator's local shell when running
 * that script, not in Vercel — see `docs/onboarding-a-shelter.md`. If a
 * real in-app handler (a future admin surface) ever calls
 * `productionLocationPolicy` directly from a request path, add it here in
 * that same change — not before.
 */
const RequiredProductionEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  CURSOR_HMAC_SECRET: z.string().min(1, "CURSOR_HMAC_SECRET is required"),
});

/**
 * Validates every secret this app's production runtime needs, throwing one
 * error naming everything missing rather than waiting for each handler to
 * discover its own gap separately.
 *
 * Called once from `instrumentation.ts`'s `register()`, which Next.js runs
 * before a server instance accepts its first request — see that file's own
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
  if (!result.success) {
    const missing = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Missing required environment variable(s): ${missing}`);
  }
}
