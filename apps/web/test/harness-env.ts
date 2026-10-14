/**
 * Shared between `playwright.config.ts` (which starts the real server with
 * this as `PRELAUNCH_GATE_SECRET`) and `test/harness/prelaunch-gate.setup.ts`
 * (which opens the gate with it) — one literal, not two copies that could
 * drift apart. Recognizable as a test value, not a real secret, same
 * reasoning as `CURSOR_HMAC_SECRET` below.
 */
export const HARNESS_PRELAUNCH_GATE_SECRET = "test-prelaunch-gate-secret-for-harness";

/** Gitignored (`test-results/`) — a per-run artifact, not checked in. */
export const PRELAUNCH_GATE_STORAGE_STATE_PATH = "./test-results/prelaunch-gate-storage-state.json";

/** Same literal apps/web/src/api/test-harness.ts uses — recognizable as the test secret, not a real one. */
export const CURSOR_HMAC_SECRET = "test-hmac-secret-for-cursor-signing";

/**
 * H1: `validateEnv()` now requires this (`apps/web/src/api/env.ts`), and
 * `next start` (`playwright.config.ts`) runs in production mode, so the webServer refuses to
 * boot without it — found by actually running the harness after adding the
 * requirement, not anticipated in advance. The seeded corpus only ever uses
 * `seed-photos/*.jpg` placeholder keys (`packages/db/src/seed.ts`), which
 * never route through this value at all (`isRealPhotoKey`,
 * `apps/web/src/image-loader.ts`) — so the actual string here is
 * unreachable by any harness assertion, same reasoning as
 * `CURSOR_HMAC_SECRET` above being a recognizable placeholder, not a real
 * secret.
 */
export const R2_PUBLIC_BASE_URL = "https://cdn.test.invalid";

/**
 * Better Auth's secret for the harness, a recognizable test value. The main
 * (production-mode) server gets it too, with `BETTER_AUTH_URL`, so its
 * `/kabinet` 404 can only come from the production branch of
 * `kabinetAuthAvailability`, not from missing config (review of f86c7cd,
 * finding 1).
 */
export const HARNESS_BETTER_AUTH_SECRET = "test-better-auth-secret-for-harness-only-0123456789";

/**
 * EM-Q11: the key every rate limiter's IP bucket is an HMAC under. The harness
 * sets one so its server keys limiters the way production does (a configured
 * secret) rather than through `rate-limit-key.ts`'s per-process fallback. A
 * recognizable test value, never a real one.
 */
export const HARNESS_RATE_LIMIT_KEY_SECRET = "test-rate-limit-key-secret-for-harness-only-0123";
