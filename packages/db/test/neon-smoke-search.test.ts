import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cityRepo } from "../src/repos/city-repo";
import { makeCity, setupTestDatabase } from "../src/test-utils/index";
import { runSearchSmoke, SEARCH_FIXTURE_NAMES } from "./neon-smoke-search";

/** The nationwide N2 smoke steps, proven locally first (postgres-js). */
describe("runSearchSmoke against the local database", () => {
  let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
  let cleanup: () => Promise<void>;
  beforeAll(async () => {
    ({ db, cleanup } = await setupTestDatabase());
  });
  afterAll(async () => cleanup?.());

  it("passes every check, and there are 6", async () => {
    const outcomes = await runSearchSmoke(db);
    expect(outcomes.filter((o) => !o.ok)).toEqual([]);
    expect(outcomes).toHaveLength(6);
  });

  // 25 earlier runs' rows would fill the 20 results with ties this run's rows can lose.
  it("passes on a branch that already holds 25 earlier runs' fixture cities", async () => {
    const earlier = Array.from({ length: 25 }, () =>
      SEARCH_FIXTURE_NAMES.map((uk) =>
        makeCity({
          id: randomUUID() as never,
          name: { uk, en: { text: "Smoke", provenance: "human" } },
        }),
      ),
    ).flat();
    await cityRepo(db).insertMissing(earlier);
    const outcomes = await runSearchSmoke(db);
    expect(outcomes.filter((o) => !o.ok)).toEqual([]);
    expect(outcomes).toHaveLength(6);
  });
});
