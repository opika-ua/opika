import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestDatabase } from "../src/test-utils/index";
import { runFiltersSmoke } from "./neon-smoke-filters";

/** The nationwide N3 smoke steps, proven locally first (postgres-js). */
describe("runFiltersSmoke against the local database", () => {
  let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
  let cleanup: () => Promise<void>;
  beforeAll(async () => {
    ({ db, cleanup } = await setupTestDatabase());
  });
  afterAll(async () => cleanup?.());

  it("passes every check, and there are 9", async () => {
    const outcomes = await runFiltersSmoke(db);
    expect(outcomes.filter((o) => !o.ok)).toEqual([]);
    expect(outcomes).toHaveLength(9);
  });

  // The 2026-11-12 sitting's 152 passed, 3 failed: a second run on one branch doubled the
  // region-wide counts. They are read as differences now, so a rerun passes too.
  it("passes again on the same database, over the first run's rows", async () => {
    const outcomes = await runFiltersSmoke(db);
    expect(outcomes.filter((o) => !o.ok)).toEqual([]);
    expect(outcomes).toHaveLength(9);
  });
});
