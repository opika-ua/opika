import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestDatabase } from "../src/test-utils/index";
import { runTimings, SEARCH_PROBES } from "./neon-smoke-timings";

/**
 * The timing sitting step, proven locally first (postgres-js): it must run end to end and print
 * its probes and plans. Numbers are never asserted (a latency measured once is not a limit).
 */
describe("runTimings against the local database", () => {
  let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
  let cleanup: () => Promise<void>;
  beforeAll(async () => {
    ({ db, cleanup } = await setupTestDatabase());
  });
  afterAll(async () => cleanup?.());

  it("has exactly twenty search probes, all long enough to run", () => {
    expect(SEARCH_PROBES).toHaveLength(20);
  });

  it("prints a line per probe, three search plans, the oblast plan and the gallery reads", async () => {
    const lines: string[] = [];
    await runTimings(db, (line) => lines.push(line));
    const text = lines.join("\n");

    expect(lines.filter((l) => /: \d+ rows in [\d.]+ ms$/.test(l))).toHaveLength(20);
    expect(text).toContain("EXPLAIN (ANALYZE, BUFFERS): the search statement");
    expect(text).toContain("the oblast predicate");
    // A plan was printed under each heading (a Limit or Sort node tops them all).
    expect(lines.filter((l) => /\b(Limit|Sort)\b/.test(l)).length).toBeGreaterThanOrEqual(4);
    expect(text).toContain("gallery.facetCounts, one oblast:");
  });
});
