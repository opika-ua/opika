import {
  type Animal,
  type CityId,
  type FeedFilters,
  type GallerySort,
  NO_FILTERS,
} from "@opika/domain";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { animalRepo } from "../src/repos/animal-repo";
import { cityRepo } from "../src/repos/city-repo";
import { galleryRepo } from "../src/repos/gallery-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import * as schema from "../src/schema/index";
import { makeAnimal, makeCity, makeShelter, setupTestDatabase } from "../src/test-utils/index";

/**
 * The M2 bar — `EXPLAIN` shows an index scan and no `Sort` node — applied to
 * the longest-waiting ordering, filtered and unfiltered.
 *
 * `docs/gallery-contract-decisions.md` §2 argues for extending the existing
 * `feed-explain.test.ts` bar to the new ordering, and adds the second,
 * filtered index specifically so that extension is possible rather than
 * waived. Covering only the unfiltered case here and asserting the filtered one
 * by inspection would be exactly the shape of failure
 * `docs/standing-constraints.md` records three times over.
 *
 * The query being explained is the one `galleryRepo.list` actually generates,
 * captured off the wire — not a hand-written approximation of it. A test that
 * explains its own SQL proves the index can serve *some* query; it does not
 * prove the repository asks one the index can serve, which is the thing that
 * would silently regress.
 *
 * ── What this proves, and what it does not ─────────────────────────────────
 *
 * Proves: for each ordering, an index exists that supplies it, and
 * `galleryRepo.list`'s own query can be answered through that index with no
 * `Sort` node. Both assertions fail when the index is wrong — verified by
 * mutation: reordering `animals_wait_anchor_idx`'s columns fails the
 * unfiltered case, and putting `listing_kind` back at the front of
 * `animals_wait_anchor_filtered_idx` (the shape
 * `docs/gallery-contract-decisions.md` §2 originally specified) fails the
 * filtered one, because a btree whose leading column is matched by
 * `= ANY(...)` rather than a single value does not return rows in index order.
 *
 * Does not prove: that Postgres *chooses* those plans under default settings.
 * It often will not, and the reason is structural rather than a missing index.
 * `count(*) OVER()` makes the window function consume every matching row, so
 * the `LIMIT` cannot stop an ordered scan early — which is the entire
 * advantage an ordered index has over "cheapest scan, then sort". With that
 * advantage gone the two plans cost almost the same and the choice turns on
 * table statistics: against this file's 1,500-row fixture the planner sorts,
 * against the ~320-row development corpus it picks the wait-anchor indexes and
 * does not. Both are correct decisions by Postgres.
 *
 * This is recorded rather than resolved because resolving it means revisiting
 * `docs/gallery-contract-decisions.md` §3's decision to fold the count into
 * the page query via a window function — a signed-off decision with its own
 * good reason (one round-trip, and a page that cannot disagree with its own
 * total under a concurrent write). Splitting the count back out would restore
 * the early-stop advantage and make the no-Sort plan the natural choice. At
 * this surface's bounded depth the sort is cheap either way; the trade is
 * worth stating, not worth taking silently.
 */

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://opika:opika@localhost:5433/opika_test";

const NOW = new Date("2026-08-05T12:00:00.000Z");
const daysBefore = (days: number): Date => new Date(NOW.getTime() - days * 86_400_000);

const captured: { query: string; parameters: readonly unknown[] }[] = [];

const client = postgres(TEST_DATABASE_URL, {
  max: 1,
  debug: (_connection, query, parameters) => {
    captured.push({ query, parameters });
  },
});
const db = drizzle(client, { schema });

let filterCity: CityId;

beforeAll(async () => {
  const setup = await setupTestDatabase();
  await setup.cleanup();

  const cities = cityRepo(db);
  const shelters = shelterRepo(db);

  // Several cities, so `city_id` is selective enough for the planner to prefer
  // seeking on it rather than treating the filter as a throwaway.
  const cityList = Array.from({ length: 5 }, () => makeCity());
  for (const city of cityList) await cities.insert(city);
  const first = cityList[0];
  if (!first) throw new Error("no city seeded");
  filterCity = first.id;

  // Many shelters, not one. With a single shelter the planner can satisfy the
  // verified-shelter semi-join by driving from `shelters` — one row, trivially
  // cheap — which destroys the ordering an index scan on `animals` would have
  // provided and makes a `Sort` node the cheapest plan for reasons that have
  // nothing to do with the indexes under test. The real corpus has dozens of
  // shelters; a fixture with one asks a different question.
  const shelterList = Array.from({ length: 20 }, (_, i) => {
    const city = cityList[i % cityList.length] ?? first;
    return makeShelter({
      displayName: `Притулок ${i}`,
      publicLocation: {
        cityId: city.id,
        district: null,
        precision: "fuzzed_address",
        approximate: { center: { lat: 50.45, lng: 30.52 }, precisionMetres: 1000 } as never,
      },
      exactAddress: {
        line1: `вул. Тестова ${i}`,
        line2: null,
        postalCode: "01001",
        cityId: city.id,
        district: null,
        coordinates: { lat: 50.45, lng: 30.52 },
      },
    });
  });
  for (const shelter of shelterList) await shelters.insert(shelter);

  const species = ["dog", "cat"] as const;
  const sizes = ["small", "medium", "large"] as const;
  const animals: Animal[] = Array.from({ length: 1500 }, (_, i) => {
    const shelter = shelterList[i % shelterList.length];
    if (!shelter) throw new Error("no shelter seeded");
    return makeAnimal({
      shelterId: shelter.id,
      name: `Тварина ${i}`,
      species: species[i % species.length] ?? "dog",
      size: sizes[i % sizes.length] ?? "medium",
      lastUpdatedAt: daysBefore(i % 400),
      listing: { kind: "published", publishedAt: daysBefore((i * 7) % 900) },
    });
  });

  const repo = animalRepo(db);
  for (let i = 0; i < animals.length; i += 250) {
    await repo.insertMany(
      animals.slice(i, i + 250).map((animal, j) => ({
        animal,
        cityId: cityList[(i + j) % cityList.length]?.id ?? first.id,
      })),
    );
  }

  await client.unsafe("ANALYZE animals");
  await client.unsafe("ANALYZE shelters");
});

afterAll(async () => {
  await client.end();
});

/**
 * Run `galleryRepo.list`, capture the page query it issued, and explain that
 * exact statement with its own parameters.
 *
 * The page query is the one carrying `count(*) OVER()`; the count-only queries
 * the repo may also run are not the ones with an ordering to preserve.
 */
async function explainGalleryQuery(opts: {
  filters: FeedFilters;
  sort: GallerySort;
}): Promise<string> {
  captured.length = 0;
  await galleryRepo(db).list({
    filters: opts.filters,
    sort: opts.sort,
    page: 1,
    pageSize: 24,
    now: NOW,
  });

  const pageQuery = captured.find((statement) => statement.query.includes("count(*) OVER()"));
  if (!pageQuery) throw new Error("the page query was not captured — the debug hook is not wired");

  // The planner is constrained to the plan family that *can* preserve an
  // ordering, so the question asked is the one that matters: is there an index
  // able to serve this ordering, or must the query sort no matter what.
  //
  // Sequential and bitmap scans are off for the reason `feed-explain.test.ts`
  // already turns them off — on a fixture-sized table a seq scan plus a sort is
  // genuinely cheaper, and choosing it says nothing about the index. Hash and
  // merge joins are off one level up, because the verified-shelter semi-join
  // under either discards its input's ordering. `enable_sort` is off last:
  // Postgres does not forbid a sort when it is off, it prices one at a
  // prohibitive cost, so a plan without one is chosen *if any exists*. That is
  // precisely the question — and it is why removing an index makes these tests
  // fail rather than merely get slower.
  //
  // See the file header for what this deliberately does not claim.
  const plannerConstraints = [
    "SET enable_seqscan = off",
    "SET enable_bitmapscan = off",
    "SET enable_hashjoin = off",
    "SET enable_mergejoin = off",
    "SET enable_sort = off",
  ];
  for (const statement of plannerConstraints) await client.unsafe(statement);
  const rows = await client.unsafe(`EXPLAIN (FORMAT TEXT) ${pageQuery.query}`, [
    ...pageQuery.parameters,
  ] as never[]);
  for (const statement of plannerConstraints) {
    await client.unsafe(statement.replace("off", "on"));
  }

  return Array.from(rows as Iterable<Record<string, unknown>>)
    .map((row) => row["QUERY PLAN"])
    .join("\n");
}

describe("longest-waiting EXPLAIN", () => {
  it("unfiltered: no Sort node, served by animals_wait_anchor_idx", async () => {
    const plan = await explainGalleryQuery({ filters: NO_FILTERS, sort: "longest_waiting" });

    expect(plan, plan).not.toContain("Sort ");
    expect(plan, plan).toContain("animals_wait_anchor_idx");
  });

  it("filtered by city, species and size: no Sort node", async () => {
    // The case the second index exists for. `docs/gallery-contract-decisions.md`
    // §2 is explicit that waiving the no-Sort bar here, to save one index, sets
    // a worse precedent than the write amplification costs.
    const filters: FeedFilters = {
      cities: { kind: "oneOf", values: [filterCity] },
      species: { kind: "oneOf", values: ["dog"] },
      sizes: { kind: "oneOf", values: ["small"] },
      ages: { kind: "any" },
    };

    const plan = await explainGalleryQuery({ filters, sort: "longest_waiting" });

    expect(plan, plan).not.toContain("Sort ");
    expect(plan, plan).toContain("animals_wait_anchor_filtered_idx");
  });

  it("freshest first still avoids a Sort node through the gallery's own query", async () => {
    // The gallery reuses the deck's ordering for this mode but reaches it
    // through a different query shape (OFFSET plus a window function), so the
    // existing feed-explain coverage does not carry over.
    const plan = await explainGalleryQuery({ filters: NO_FILTERS, sort: "freshest" });

    expect(plan, plan).not.toContain("Sort ");
    expect(plan, plan).toContain("animals_feed_unfiltered_idx");
  });
});
