/**
 * Shared between `playwright.config.ts` (which starts the real server with
 * this as `PRELAUNCH_GATE_SECRET`) and `test/harness/prelaunch-gate.setup.ts`
 * (which opens the gate with it) — one literal, not two copies that could
 * drift apart. Recognizable as a test value, not a real secret, same
 * reasoning as `playwright.config.ts`'s own `CURSOR_HMAC_SECRET`.
 */
export const HARNESS_PRELAUNCH_GATE_SECRET = "test-prelaunch-gate-secret-for-harness";

/** Gitignored (`test-results/`) — a per-run artifact, not checked in. */
export const PRELAUNCH_GATE_STORAGE_STATE_PATH = "./test-results/prelaunch-gate-storage-state.json";
