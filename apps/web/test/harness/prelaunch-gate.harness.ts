/**
 * The pre-launch gate itself, against a real running server - not just that
 * it can be *opened* (`prelaunch-gate.setup.ts` proves that, implicitly, by
 * being the thing every other harness file's `storageState` depends on) but
 * that it actually *denies* an unauthenticated caller. Without this, every
 * other harness file passing would only prove the gate can be satisfied,
 * never that it does anything when it isn't.
 *
 * Uses the plain `request` fixture with an explicitly empty `storageState`:
 * Playwright 1.64 applies the project's `storageState` to `request` too, so the
 * override (and the per-test guard) keeps these callers cookie-less on every version.
 */

import { expect, test } from "@playwright/test";
import { PRELAUNCH_GATE_QUERY_PARAM } from "../../src/api/prelaunch-gate";
import { HARNESS_PRELAUNCH_GATE_SECRET } from "../harness-env";

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("pre-launch gate, against a real server", () => {
  test("a request with no gate cookie and no gate query parameter is denied", async ({
    request,
  }) => {
    expect(
      (await request.storageState()).cookies,
      "the request context must carry no gate cookie",
    ).toHaveLength(0);
    const response = await request.get("/tvaryny");
    expect(response.status()).toBe(403);
  });

  test("a request with the wrong gate query value is denied", async ({ request }) => {
    expect(
      (await request.storageState()).cookies,
      "the request context must carry no gate cookie",
    ).toHaveLength(0);
    const response = await request.get(`/tvaryny?${PRELAUNCH_GATE_QUERY_PARAM}=not-the-secret`);
    expect(response.status()).toBe(403);
  });

  test("a request outside /tvaryny is denied identically – the gate is not scoped to the gallery", async ({
    request,
  }) => {
    expect(
      (await request.storageState()).cookies,
      "the request context must carry no gate cookie",
    ).toHaveLength(0);
    const response = await request.get("/prytulkam");
    expect(response.status()).toBe(403);
  });

  test("a request with the correct gate query value is let through", async ({ request }) => {
    expect(
      (await request.storageState()).cookies,
      "the request context must carry no gate cookie",
    ).toHaveLength(0);
    const response = await request.get(
      `/tvaryny?${PRELAUNCH_GATE_QUERY_PARAM}=${HARNESS_PRELAUNCH_GATE_SECRET}`,
    );
    expect(response.status()).toBe(200);
  });
});
