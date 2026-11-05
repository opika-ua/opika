import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestDatabase } from "../src/test-utils/index";
import { runEarlyListingSmoke } from "./neon-smoke-early-listing";

/** The early-listing smoke steps, proven locally first (postgres-js). */
describe("runEarlyListingSmoke against the local database", () => {
  let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
  let cleanup: () => Promise<void>;
  beforeAll(async () => {
    ({ db, cleanup } = await setupTestDatabase());
  });
  afterAll(async () => cleanup?.());

  it("passes every check, and there are 4", async () => {
    const outcomes = await runEarlyListingSmoke(db);
    expect(outcomes.filter((o) => !o.ok)).toEqual([]);
    expect(outcomes).toHaveLength(4);
  });
});
