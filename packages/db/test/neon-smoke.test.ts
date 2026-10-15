import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestDatabase } from "../src/test-utils/index";
import { runSmoke, smokeTarget } from "./neon-smoke";

/**
 * The Neon smoke run, proven locally first: every statement it exercises
 * passes against the local database (postgres-js), so a FAIL on the Neon
 * branch is the driver or the dialect, not the script. And the target guard,
 * which is what keeps it off production.
 */

const NEON = (endpoint: string) =>
  `postgresql://u:secret@${endpoint}-pooler.eu-central-1.aws.neon.tech/neondb`;

describe("smokeTarget", () => {
  it("accepts exactly the expected endpoint, pooler or direct", () => {
    expect(smokeTarget(NEON("ep-rehearsal-1"), "ep-rehearsal-1", "ep-prod-1")).toEqual({
      kind: "ok",
      host: "ep-rehearsal-1-pooler.eu-central-1.aws.neon.tech",
    });
  });

  it.each([
    ["a different endpoint than expected", NEON("ep-other-1"), "ep-rehearsal-1", "ep-prod-1"],
    ["no --expect", NEON("ep-rehearsal-1"), undefined, "ep-prod-1"],
    ["production, even when expected", NEON("ep-prod-1"), "ep-prod-1", "ep-prod-1"],
    ["an unknown production endpoint", NEON("ep-rehearsal-1"), "ep-rehearsal-1", undefined],
    [
      "production, when PROD_NEON_ENDPOINT is a URL",
      NEON("ep-prod-1"),
      "ep-prod-1",
      NEON("ep-prod-1"),
    ],
    [
      "production, when PROD_NEON_ENDPOINT is quoted",
      NEON("ep-prod-1"),
      "ep-prod-1",
      '"ep-prod-1"',
    ],
    [
      "a local database",
      "postgres://opika:opika@localhost:5433/opika",
      "ep-rehearsal-1",
      "ep-prod-1",
    ],
    ["an unparseable URL", "postgresql://u:secret@[nope", "ep-rehearsal-1", "ep-prod-1"],
  ])("refuses %s, never echoing the URL", (_what, url, expected, prod) => {
    const target = smokeTarget(url, expected, prod);
    expect(target.kind).toBe("refused");
    expect(JSON.stringify(target)).not.toContain("secret");
  });
});

describe("runSmoke against the local database", () => {
  let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
  let cleanup: () => Promise<void>;
  beforeAll(async () => {
    ({ db, cleanup } = await setupTestDatabase());
  });
  afterAll(async () => cleanup?.());

  it("passes every statement", async () => {
    const outcomes = await runSmoke(db);
    expect(outcomes.filter((o) => !o.ok)).toEqual([]);
    expect(outcomes.length).toBe(21);
  });
});
