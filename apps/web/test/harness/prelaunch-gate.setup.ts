import { test as setup } from "@playwright/test";
import { HARNESS_PRELAUNCH_GATE_SECRET, PRELAUNCH_GATE_STORAGE_STATE_PATH } from "../harness-env";

/**
 * Runs once, before every `.harness.ts` project — see `playwright.config.ts`'s
 * `dependencies: ["setup"]` on the `chromium` project.
 *
 * `SITE_IS_PUBLICLY_DISCOVERABLE` is `false` today (`apps/web/src/seo-flags.ts`),
 * so `proxy.ts` 403s every request against this harness's real server the same
 * way it would against production — there is no test-only bypass for it, on
 * purpose, since a bypass here would mean the harness stops covering the gate
 * at all. This opens it the same way a real operator would: a real navigation
 * carrying the query-parameter secret, which `proxy.ts` answers with a real
 * `Set-Cookie` the browser stores normally — then `storageState` persists that
 * cookie jar for every later project to reuse, so each of the other ~15
 * harness files needs no gate-specific code of its own.
 */
setup("open the pre-launch gate", async ({ page }) => {
  await page.goto(`/tvaryny?gate=${HARNESS_PRELAUNCH_GATE_SECRET}`);
  await page.context().storageState({ path: PRELAUNCH_GATE_STORAGE_STATE_PATH });
});
