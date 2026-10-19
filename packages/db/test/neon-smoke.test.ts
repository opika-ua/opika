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

  /**
   * Oleksii, 2026-10-19, verbatim: "that smokeTarget still accepts the standard child-branch host
   * format (ep-…-pooler.c-N.<region>.aws.neon.tech), with a test pinning that exact format." The
   * shape his step-37 smoke ran against, under #144's stricter host rule. Written out, not built
   * with NEON(); an empty environment, so no PG* variable of the machine decides it.
   */
  it.each([
    [
      "postgresql://u:secret@ep-rehearsal-1-pooler.c-2.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
      "ep-rehearsal-1-pooler.c-2.eu-central-1.aws.neon.tech",
    ],
    [
      "postgresql://u:secret@ep-rehearsal-1-pooler.c-12.us-east-2.aws.neon.tech/neondb?sslmode=require",
      "ep-rehearsal-1-pooler.c-12.us-east-2.aws.neon.tech",
    ],
  ])(
    "accepts the standard child-branch host format (ep-…-pooler.c-N.<region>.aws.neon.tech): %s",
    (url, host) => {
      expect(smokeTarget(url, "ep-rehearsal-1", "ep-prod-1", {})).toEqual({ kind: "ok", host });
    },
  );

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

  /** The production guard's one-host reading (2026-10-19): production can't hide behind the rehearsal host. */
  it.each([
    [
      "a fragment",
      "postgresql://u:secret@ep-rehearsal-1-pooler.eu-central-1.aws.neon.tech#,ep-prod-1-pooler.eu-central-1.aws.neon.tech/neondb",
      "it has a '#' fragment",
    ],
    [
      "a second '@'",
      "postgresql://u:secret@ep-prod-1-pooler.eu-central-1.aws.neon.tech,x@ep-rehearsal-1-pooler.eu-central-1.aws.neon.tech/neondb",
      "it has more than one '@' before the host",
    ],
    [
      "a percent-encoded host list",
      "postgresql://u:secret@nope%2Cep-prod-1-pooler.eu-central-1.aws.neon.tech/neondb",
      "it lists several hosts",
    ],
  ])("refuses %s as not exactly one host", (_what, url, why) => {
    expect(smokeTarget(url, "ep-rehearsal-1", "ep-prod-1")).toEqual({
      kind: "refused",
      reason: `DATABASE_URL can't be read as exactly one host: ${why} (not printing it)`,
    });
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
    // 25 through PR 3, R-UI 1's 26 (S1 row: admin counts and donationPending),
    // K3's 27–31 (F-B1, K3-T7, RH-B7), then K2's 32–36 (the list's keyset,
    // filters and counts; confirm/undo; the recorded moves), then KH-Q12's 37
    // (auth:revoke-all's purge).
    expect(outcomes.length).toBe(37);
  });
});
