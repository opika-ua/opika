import type { SQL } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../src/client";
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
    // K3's 27-31 (F-B1, K3-T7, RH-B7), then K2's 32-36 (the list's keyset,
    // filters and counts; confirm/undo; the recorded moves), then KH-Q12's 37
    // (auth:revoke-all's purge), then 38 (the gallery's relaxation counts),
    // then 39 (fur set and cleared by the kabinet edit, filtered in the
    // gallery and the deck, DR1 S3), then 40 (the gallery list scoped to one
    // shelter, DR1 S5), then S8's 41 (animals.cardsByIds's findByIds), then
    // GDPR photo retention's 42 - six checks (PR #200, Tier 1 review,
    // blocker 4): referencedStorageKeys' jsonb_array_elements SELECT,
    // referencedObjectKeys' derived variant, recordScan's track, still
    // Unreferenced's re-check, and afterDeleted's jsonb_set UPDATE plus a
    // read-back confirming the null landed for real, not just in the
    // statement's own reported count. Then 42b, two checks (pet card PR 4,
    // Tier 1 review, note 2): referencedStorageKeys' UNION also reads
    // shelters.logo over neon-http, and referencedObjectKeys derives the
    // logo's own small/large variants, not the animal-photo ones. Then 43,
    // the pet card's fields
    // (migration 0017): the schema's first array column, set and cleared
    // through writeEditIf and read back. Then 44, two checks (pet card PR 1b):
    // the temperament filter's array overlap, one scalar parameter per trait,
    // and the colour filter, in the gallery, the deck and the relaxation
    // counts. Then 44b, one more (sex-filter feature): the sex filter's own
    // IN clause, over the same corpus, including the explicit "unknown"
    // value. Then 45, two checks (pet card PR 2): the scalar-subquery seek
    // in animals.neighbours - list() order through a tied pair broken by id,
    // and the end-of-list/unknown-id null cases - over neon-http's own
    // timestamptz comparison and id tiebreak, not just postgres-js's.
    expect(outcomes.length).toBe(55);
  });

  it("passes every statement over a driver whose raw results are `{ rows }`, as neon-http's are", async () => {
    // Production's driver returns a raw `db.execute()` result as
    // `{ rows, fields, … }`, not postgres-js's array (#166). This wrapper gives
    // the local database that shape, so a step that reads a raw result as an
    // array fails here before it reaches Neon. A second run on the same
    // database: every step makes fixtures of its own, under a fresh tag.
    const neonHttpRawShape = new Proxy(db, {
      get(target, property, receiver) {
        if (property === "execute") {
          return async (query: SQL) => ({
            rows: Array.from(await target.execute(query)),
            fields: [],
          });
        }
        return Reflect.get(target, property, receiver);
      },
    }) as Database;
    const outcomes = await runSmoke(neonHttpRawShape);
    expect(outcomes.filter((o) => !o.ok)).toEqual([]);
    expect(outcomes.length).toBe(55);
  });
});
