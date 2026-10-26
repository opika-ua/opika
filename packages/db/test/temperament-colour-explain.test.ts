import {
  type Animal,
  type AnimalColour,
  type CoatColour,
  DEFAULT_SEEN_SET_POLICY,
  EVERYONE_SCOPE,
  type FeedFilters,
  NO_FILTERS,
  type TemperamentTrait,
} from "@opika/domain";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { animalRepo } from "../src/repos/animal-repo";
import { cityRepo } from "../src/repos/city-repo";
import { feedRepo } from "../src/repos/feed-repo";
import { galleryRepo } from "../src/repos/gallery-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import * as schema from "../src/schema/index";
import { makeAnimal, makeCity, makeShelter, setupTestDatabase } from "../src/test-utils/index";
import { TEST_DATABASE_URL } from "../src/test-utils/setup";

/**
 * The temperament and colour filters reach their indexes (migration 0017):
 * `animals_temperament_traits_idx` (GIN, for the array overlap) and
 * `animals_coat_colour_idx` (btree, for the `IN`), both partial on the
 * discoverable kinds.
 *
 * Same method as `wait-anchor-explain.test.ts`: the statement explained is the
 * one the repository actually sends, captured off the wire with its own
 * parameters, not a hand-written query that resembles it. A test that
 * explains its own SQL proves an index can serve *some* query; this proves
 * the repository's query is one it can serve, which is what would regress
 * silently (a clause rewritten into a form no index answers, or an array
 * bound in a shape the planner can't match to the partial index).
 *
 * Sequential scans are off, as in `feed-explain.test.ts`: on a fixture-sized
 * table a full scan is genuinely cheapest and says nothing about the index.
 * Bitmap scans stay on, because a GIN index is only ever read through one.
 * The filtered values are rare in the fixture (one animal in fifty), as a
 * real filter is selective, so walking another index in sort order and
 * discarding nearly every row is the expensive plan, not a tie.
 *
 * The deck's temperament case filters on a rarer trait still (three animals
 * in 1,500). The deck's `LIMIT` lets an ordered walk of
 * `animals_feed_unfiltered_idx` stop once it has a page, so at one in fifty
 * the planner walks that index and filters, and the builder's first run of
 * this file showed it doing so: the right plan, since a page turns up early.
 * When matches are too few for an early stop, the GIN index is the cheap
 * plan, and that is the case asked about.
 *
 * Proves: each filter's clause, as the gallery and the deck send it, can be
 * answered through its own index, and is under these settings (mutation-
 * tested: rewriting the colour clause as `lower(coat_colour) IN (...)`, or
 * the temperament clause as a subquery over `unnest`, fails these). Does not
 * prove the planner picks the index under default settings on any given
 * corpus; at ~320 rows it may well scan, correctly.
 */

const NOW = new Date("2026-10-26T12:00:00.000Z");
const hoursBefore = (hours: number): Date => new Date(NOW.getTime() - hours * 3_600_000);

const captured: { query: string; parameters: readonly unknown[] }[] = [];

const client = postgres(TEST_DATABASE_URL, {
  max: 1,
  debug: (_connection, query, parameters) => {
    captured.push({ query, parameters });
  },
});
const db = drizzle(client, { schema });

/** Common traits and colours most animals carry; the rare ones are the filters under test. */
const COMMON_TRAITS = ["playful", "calm", "affectionate", "energetic"] as const;
const COMMON_COLOURS = ["black", "white", "grey", "ginger", "brown", "tabby"] as const;

beforeAll(async () => {
  const setup = await setupTestDatabase();
  await setup.cleanup();

  const cities = Array.from({ length: 5 }, () => makeCity());
  for (const city of cities) await cityRepo(db).insert(city);
  const first = cities[0];
  if (!first) throw new Error("no city seeded");

  // Many shelters, for the reason `wait-anchor-explain.test.ts` gives: with
  // one, the verified-shelter semi-join is trivially cheap to drive from
  // `shelters`, which says nothing about the indexes under test.
  const shelters = Array.from({ length: 20 }, (_, i) =>
    makeShelter({
      displayName: `Притулок ${i}`,
      publicLocation: {
        ...makeShelter().publicLocation,
        cityId: (cities[i % cities.length] ?? first).id,
      },
    }),
  );
  for (const shelter of shelters) await shelterRepo(db).insert(shelter);

  const animals: Animal[] = Array.from({ length: 1500 }, (_, i) => {
    const shelter = shelters[i % shelters.length];
    if (!shelter) throw new Error("no shelter seeded");
    const rareTrait: TemperamentTrait[] =
      i % 50 === 0
        ? ["independent"]
        : i % 50 === 2
          ? ["shy"]
          : i % 500 === 7
            ? ["good_with_dogs"]
            : [];
    const traits: TemperamentTrait[] = [
      COMMON_TRAITS[i % COMMON_TRAITS.length] ?? "calm",
      ...rareTrait,
    ];
    const colour: CoatColour | null =
      i % 50 === 1
        ? "cream"
        : i % 50 === 3
          ? "spotted"
          : i % 7 === 6
            ? null
            : (COMMON_COLOURS[i % COMMON_COLOURS.length] ?? "black");
    const animalColour: AnimalColour | null = colour === null ? null : { kind: "preset", colour };
    const at = hoursBefore(i);
    return makeAnimal({
      shelterId: shelter.id,
      name: `Тварина ${i}`,
      temperament: traits.map((trait) => ({ kind: "preset" as const, trait })),
      colour: animalColour,
      listing: { kind: "published", publishedAt: at, confirmedAt: at, undoable: null },
    });
  });
  const repo = animalRepo(db);
  for (let i = 0; i < animals.length; i += 250) {
    await repo.insertMany(
      animals.slice(i, i + 250).map((animal, j) => ({
        animal,
        cityId: (cities[(i + j) % cities.length] ?? first).id,
      })),
    );
  }

  await client.unsafe("ANALYZE animals");
  await client.unsafe("ANALYZE shelters");
});

afterAll(async () => {
  await client.end();
});

/** The page query `galleryRepo.list` sent, the one carrying `count(*) OVER()`. */
async function galleryQuery(filters: FeedFilters) {
  captured.length = 0;
  await galleryRepo(db).list({
    filters,
    scope: EVERYONE_SCOPE,
    sort: "freshest",
    page: 1,
    pageSize: 24,
    now: NOW,
  });
  const pageQuery = captured.find((statement) => statement.query.includes("count(*) OVER()"));
  if (!pageQuery) throw new Error("the page query was not captured – the debug hook is not wired");
  return pageQuery;
}

/** The one statement `feedRepo.list` sent for an anonymous first page. */
async function deckQuery(filters: FeedFilters) {
  captured.length = 0;
  await feedRepo(db).list({
    filters,
    cursor: null,
    limit: 20,
    adopterId: null,
    now: NOW,
    seenSetPolicy: DEFAULT_SEEN_SET_POLICY,
  });
  const statement = captured.at(-1);
  if (!statement) throw new Error("no SQL captured – the debug hook is not wired");
  return statement;
}

async function explain(statement: { query: string; parameters: readonly unknown[] }) {
  await client.unsafe("SET enable_seqscan = off");
  const rows = await client.unsafe(`EXPLAIN (FORMAT TEXT) ${statement.query}`, [
    ...statement.parameters,
  ] as never[]);
  await client.unsafe("SET enable_seqscan = on");
  return Array.from(rows as Iterable<Record<string, unknown>>)
    .map((row) => row["QUERY PLAN"])
    .join("\n");
}

const byTemperament = (
  values: readonly [TemperamentTrait, ...TemperamentTrait[]],
): FeedFilters => ({
  ...NO_FILTERS,
  temperaments: { kind: "oneOf", values },
});
const byColour = (values: readonly [CoatColour, ...CoatColour[]]): FeedFilters => ({
  ...NO_FILTERS,
  colours: { kind: "oneOf", values },
});

/**
 * The index is read *for the clause*: its scan node carries the clause as its
 * `Index Cond`. The name alone isn't enough. Both indexes are partial on the
 * discoverable kinds, which the query always implies, so with sequential scans
 * off the planner will read either one end to end as a cheap stand-in for a
 * table scan and narrow the rows with a `Filter`. The builder saw exactly that
 * under the `lower(coat_colour)` mutation: `Bitmap Index Scan on
 * animals_coat_colour_idx (rows=1500)` with no `Index Cond`, which a check on
 * the name passed.
 */
const TEMPERAMENT_INDEX_COND =
  /Bitmap Index Scan on animals_temperament_traits_idx[^\n]*\n\s*Index Cond: \(temperament_traits && /;
const COLOUR_INDEX_COND =
  /(?:Bitmap Index Scan on|Index Scan using) animals_coat_colour_idx[^\n]*\n\s*Index Cond: \(coat_colour = /;

describe("temperament filter EXPLAIN: animals_temperament_traits_idx (GIN)", () => {
  it("the gallery's query, one trait", async () => {
    const plan = await explain(await galleryQuery(byTemperament(["independent"])));
    expect(plan, plan).toMatch(TEMPERAMENT_INDEX_COND);
  });

  it("the gallery's query, two traits (two scalar parameters in one ARRAY[...])", async () => {
    const plan = await explain(await galleryQuery(byTemperament(["independent", "shy"])));
    expect(plan, plan).toMatch(TEMPERAMENT_INDEX_COND);
  });

  it("the deck's query, a trait too rare for its LIMIT to stop an ordered walk early", async () => {
    const plan = await explain(await deckQuery(byTemperament(["good_with_dogs"])));
    expect(plan, plan).toMatch(TEMPERAMENT_INDEX_COND);
  });
});

describe("colour filter EXPLAIN: animals_coat_colour_idx (btree)", () => {
  it("the gallery's query, one colour", async () => {
    const plan = await explain(await galleryQuery(byColour(["cream"])));
    expect(plan, plan).toMatch(COLOUR_INDEX_COND);
  });

  it("the gallery's query, two colours", async () => {
    const plan = await explain(await galleryQuery(byColour(["cream", "spotted"])));
    expect(plan, plan).toMatch(COLOUR_INDEX_COND);
  });

  it("the deck's query", async () => {
    const plan = await explain(await deckQuery(byColour(["cream", "spotted"])));
    expect(plan, plan).toMatch(COLOUR_INDEX_COND);
  });
});
