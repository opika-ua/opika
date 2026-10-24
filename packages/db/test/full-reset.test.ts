import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { countFullResetTables, FULL_RESET_TABLES, truncateFullReset } from "../src/full-reset";
import { adopterRepo } from "../src/repos/adopter-repo";
import { animalRepo } from "../src/repos/animal-repo";
import { cityRepo } from "../src/repos/city-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { swipeRepo } from "../src/repos/swipe-repo";
import { cities } from "../src/schema/cities";
import {
  makeAdopter,
  makeAnimal,
  makeCity,
  makeShelter,
  makeSwipe,
  setupTestDatabase,
  truncateAll,
} from "../src/test-utils/index";

/**
 * `db:full-reset`'s own regression test, independent of the table-coverage
 * scan (`full-reset-table-coverage.test.ts`, which proves the *list* is
 * exhaustive). This proves the *mechanism*: populated tables go to 0,
 * `cities` — the one deliberate exclusion — is untouched, row and all.
 */
let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());
beforeEach(async () => truncateAll(db));

describe("countFullResetTables / truncateFullReset", () => {
  it("counts what's there, truncates every listed table to 0, and leaves cities alone", async () => {
    const city = makeCity();
    await cityRepo(db).insert(city);
    const shelter = makeShelter({
      publicLocation: { ...makeShelter().publicLocation, cityId: city.id } as never,
    });
    await shelterRepo(db).insert(shelter);
    const animal = makeAnimal({ shelterId: shelter.id });
    await animalRepo(db).insert(animal, city.id as never);
    const adopter = makeAdopter();
    await adopterRepo(db).insert(adopter);
    await swipeRepo(db).record(makeSwipe({ adopterId: adopter.id, animalId: animal.id }));

    const before = await countFullResetTables(db);
    expect(before.shelters).toBe(1);
    expect(before.animals).toBe(1);
    expect(before.adopters).toBe(1);
    expect(before.swipes).toBe(1);

    await truncateFullReset(db);

    const after = await countFullResetTables(db);
    for (const table of FULL_RESET_TABLES) {
      expect(after[table], `${table} should be 0 after a full reset`).toBe(0);
    }

    // The one deliberate exclusion: still there, same row.
    const survivingCities = await db.select().from(cities);
    expect(survivingCities.map((c) => c.id)).toEqual([city.id]);
  });

  it("is a no-op on an already-empty database — every count is 0 before and after", async () => {
    const before = await countFullResetTables(db);
    for (const table of FULL_RESET_TABLES) expect(before[table]).toBe(0);
    await truncateFullReset(db);
    const after = await countFullResetTables(db);
    for (const table of FULL_RESET_TABLES) expect(after[table]).toBe(0);
  });
});
