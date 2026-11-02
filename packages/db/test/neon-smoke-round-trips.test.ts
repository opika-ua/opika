import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestDatabase } from "../src/test-utils/index";
import { runRoundTripsSmoke } from "./neon-smoke-round-trips";

/** The round-trip PR's smoke steps, proven locally first (postgres-js). */
describe("runRoundTripsSmoke against the local database", () => {
  let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
  let cleanup: () => Promise<void>;
  beforeAll(async () => {
    ({ db, cleanup } = await setupTestDatabase());
  });
  afterAll(async () => cleanup?.());

  it("passes every check, and there are 5", async () => {
    const outcomes = await runRoundTripsSmoke(db);
    expect(outcomes.filter((o) => !o.ok)).toEqual([]);
    expect(outcomes).toHaveLength(5);
  });
});
