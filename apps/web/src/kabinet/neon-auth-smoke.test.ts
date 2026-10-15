import { setupTestDatabase } from "@opika/db/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runAuthSmoke } from "../../scripts/neon-auth-smoke";

/**
 * The auth smoke (`scripts/neon-auth-smoke.ts`), proven locally first: every
 * step passes against the local database (postgres-js), so a FAIL on the Neon
 * branch is the driver or the dialect, not the script. The target guard it
 * shares with `db:neon-smoke` is tested there (`smokeTarget`).
 */
describe("runAuthSmoke against the local database", () => {
  let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
  let cleanup: () => Promise<void>;
  beforeAll(async () => {
    ({ db, cleanup } = await setupTestDatabase());
  });
  afterAll(async () => cleanup?.());

  it("passes every step: sign-in, verify, the accept, getSession, sign-out", async () => {
    const outcomes = await runAuthSmoke(db);
    expect(outcomes.filter((o) => !o.ok)).toEqual([]);
    expect(outcomes.map((o) => o.name)).toEqual([
      "sign-in request (verification row through Better Auth's adapter)",
      "verify (token consumed, session created, email verified, first session stamped)",
      "automatic accept on sign-in (invitation + membership, one statement)",
      "getSession (Better Auth reads the session back; the kabinet resolves a shelter admin)",
      "sign-out (session row deleted)",
    ]);
  });

  it("prints no link, token or address in any line", async () => {
    const outcomes = await runAuthSmoke(db);
    for (const o of outcomes) {
      expect(o.detail).not.toMatch(/token=|https?:\/\/|@/);
    }
  });
});
