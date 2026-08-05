import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { animalRepo } from "../src/repos/animal-repo.js";
import { cityRepo } from "../src/repos/city-repo.js";
import { shelterRepo } from "../src/repos/shelter-repo.js";
import {
  makeAnimal,
  makeCity,
  makeShelter,
  setupTestDatabase,
  truncateAll,
} from "../src/test-utils/index.js";

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  const result = await setupTestDatabase();
  db = result.db;
  cleanup = result.cleanup;
});

afterAll(async () => {
  await cleanup?.();
});

beforeEach(async () => {
  await truncateAll(db);
});

describe("feed query EXPLAIN", () => {
  it("uses an index scan with no sort for unfiltered feed", async () => {
    const cities = cityRepo(db);
    const shelters = shelterRepo(db);
    const animals = animalRepo(db);

    const city = makeCity();
    await cities.insert(city);
    const shelter = makeShelter({
      publicLocation: {
        cityId: city.id,
        district: null,
        precision: "fuzzed_address",
        approximate: { center: { lat: 50.45, lng: 30.52 }, precisionMetres: 1000 } as never,
      },
      exactAddress: {
        line1: "вул. Тестова 1",
        line2: null,
        postalCode: "01001",
        cityId: city.id,
        district: null,
        coordinates: { lat: 50.45, lng: 30.52 },
      },
    });
    await shelters.insert(shelter);

    // Insert enough rows for the planner to consider index usage
    const animalList = Array.from({ length: 50 }, (_, i) =>
      makeAnimal({
        shelterId: shelter.id,
        name: `Тест ${i}`,
        lastUpdatedAt: new Date(Date.UTC(2026, 7, 1, 12, 0, 0) - i * 3600000),
      }),
    );
    await animals.insertMany(animalList.map((a) => ({ animal: a, cityId: city.id })));

    // Run ANALYZE so the planner has accurate statistics
    await db.execute(sql`ANALYZE animals`);
    await db.execute(sql`ANALYZE shelters`);

    // Disable seq scan and bitmap scan so the planner uses an index scan
    // that preserves ordering. This validates the index can provide ordering,
    // which is what matters at scale.
    await db.execute(sql`SET enable_seqscan = off`);
    await db.execute(sql`SET enable_bitmapscan = off`);

    const explainResult = await db.execute(
      sql`EXPLAIN (FORMAT TEXT) SELECT * FROM animals
        WHERE listing_kind IN ('published', 'reserved')
          AND shelter_id IN (SELECT id FROM shelters WHERE verification_status = 'verified')
        ORDER BY last_updated_at DESC, id
        LIMIT 20`,
    );

    // Re-enable for other tests
    await db.execute(sql`SET enable_seqscan = on`);
    await db.execute(sql`SET enable_bitmapscan = on`);

    const plan = Array.from(explainResult as Iterable<Record<string, unknown>>)
      .map((r) => r["QUERY PLAN"])
      .join("\n");

    // The partial index animals_feed_unfiltered_idx should provide ordering
    // without a separate sort node
    expect(plan).not.toContain("Sort ");
    const usesIndex = plan.includes("Index") || plan.includes("Bitmap");
    expect(usesIndex).toBe(true);
  });
});
