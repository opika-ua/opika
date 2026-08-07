import {
  type AdopterId,
  type AgeBucket,
  type AnimalSpecies,
  type CityId,
  DEFAULT_SEEN_SET_POLICY,
  type FeedFilters,
  NO_FILTERS,
  type SizeBucket,
} from "@opika/domain";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { feedRepo } from "../src/repos/feed-repo";
import * as schema from "../src/schema/index";
import { setupTestDatabase } from "../src/test-utils/index";

/**
 * `feed.list`'s generated SQL, pinned character-for-character.
 *
 * The deck's WHERE clause was factored out into `buildFeedPredicate` so the
 * gallery could share it. The deck's own tests would not have caught a
 * subtly *narrower* predicate coming back — they assert on the rows a small
 * fixture corpus returns, and a dropped or reordered condition can leave those
 * rows unchanged. So the thing that has to hold is the SQL itself, and the only
 * way to assert it against the shape that existed before the refactor is to
 * have recorded that shape first.
 *
 * The snapshot in `__snapshots__/` was committed from the pre-extraction
 * `feedRepo.list` — see the commit that introduced this file, which lands
 * before the one that extracts the helper. Regenerating it is therefore never
 * the right response to a failure here: either the change to `feed.list` was
 * intended, in which case say so in the commit, or the shared predicate has
 * drifted, which is exactly what this exists to report.
 *
 * Parameters are snapshotted alongside the text because a condition can be
 * dropped without the query text changing shape — `IN ($1)` versus `IN ($1,$2)`
 * looks similar and is not.
 */

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://opika:opika@localhost:5433/opika_test";

// Fixed rather than random: the parameter values are part of the snapshot.
const CITY_A = "11111111-1111-4111-8111-111111111111" as CityId;
const CITY_B = "22222222-2222-4222-8222-222222222222" as CityId;
const ADOPTER = "33333333-3333-4333-8333-333333333333" as AdopterId;
const NOW = new Date("2026-08-05T12:00:00.000Z");
const CURSOR_AT = new Date("2026-07-01T09:15:00.000Z");
const CURSOR_ID = "44444444-4444-4444-8444-444444444444";

const captured: { query: string; parameters: readonly unknown[] }[] = [];

const client = postgres(TEST_DATABASE_URL, {
  max: 1,
  debug: (_connection, query, parameters) => {
    captured.push({ query, parameters });
  },
});
const db = drizzle(client, { schema });

beforeAll(async () => {
  // Only to guarantee the tables exist; no rows are needed, since what is being
  // asserted is the query text, not its result.
  const setup = await setupTestDatabase();
  await setup.cleanup();
});

afterAll(async () => {
  await client.end();
});

/** The generated SQL for one `feedRepo.list` call, normalised for snapshotting. */
async function sqlFor(opts: {
  filters: FeedFilters;
  cursor: { lastUpdatedAt: Date; id: string } | null;
  adopterId: AdopterId | null;
}): Promise<{ query: string; parameters: readonly unknown[] }> {
  captured.length = 0;
  await feedRepo(db).list({
    filters: opts.filters,
    cursor: opts.cursor,
    limit: 20,
    adopterId: opts.adopterId,
    now: NOW,
    seenSetPolicy: DEFAULT_SEEN_SET_POLICY,
  });

  const statement = captured.at(-1);
  if (!statement) throw new Error("no SQL captured — the debug hook is not wired");
  return {
    // Whitespace is an artefact of how the conditions are assembled, not of
    // what they mean; collapsing it keeps the snapshot about the predicate.
    query: statement.query.replace(/\s+/g, " ").trim(),
    parameters: statement.parameters,
  };
}

const ALL_FILTERS: FeedFilters = {
  cities: { kind: "oneOf", values: [CITY_A, CITY_B] },
  species: { kind: "oneOf", values: ["dog"] as [AnimalSpecies] },
  sizes: { kind: "oneOf", values: ["small", "medium"] as [SizeBucket, SizeBucket] },
  ages: { kind: "oneOf", values: ["baby", "young"] as [AgeBucket, AgeBucket] },
};

describe("feed.list generated SQL is unchanged by the shared-predicate extraction", () => {
  it("unfiltered, no cursor, anonymous", async () => {
    expect(await sqlFor({ filters: NO_FILTERS, cursor: null, adopterId: null })).toMatchSnapshot();
  });

  it("city only", async () => {
    expect(
      await sqlFor({
        filters: { ...NO_FILTERS, cities: { kind: "oneOf", values: [CITY_A] } },
        cursor: null,
        adopterId: null,
      }),
    ).toMatchSnapshot();
  });

  it("every filter dimension constrained", async () => {
    expect(await sqlFor({ filters: ALL_FILTERS, cursor: null, adopterId: null })).toMatchSnapshot();
  });

  it("every filter dimension, plus a cursor and a seen-set", async () => {
    expect(
      await sqlFor({
        filters: ALL_FILTERS,
        cursor: { lastUpdatedAt: CURSOR_AT, id: CURSOR_ID },
        adopterId: ADOPTER,
      }),
    ).toMatchSnapshot();
  });

  it("a single age bucket, which takes the un-OR'd branch", async () => {
    // `ageAnchorRange` collapses to one condition for a single bucket and to an
    // OR over several otherwise — two code paths, both worth pinning.
    expect(
      await sqlFor({
        filters: { ...NO_FILTERS, ages: { kind: "oneOf", values: ["senior"] as [AgeBucket] } },
        cursor: null,
        adopterId: null,
      }),
    ).toMatchSnapshot();
  });

  it("an open-ended age bucket, where one side of the range is unbounded", async () => {
    expect(
      await sqlFor({
        filters: { ...NO_FILTERS, ages: { kind: "oneOf", values: ["baby"] as [AgeBucket] } },
        cursor: null,
        adopterId: null,
      }),
    ).toMatchSnapshot();
  });
});
