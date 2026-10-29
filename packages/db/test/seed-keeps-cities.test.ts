import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cityRepo } from "../src/repos/city-repo";
import { cities } from "../src/schema/cities";
import { citySlugAliases } from "../src/schema/city-slug-aliases";
import { buildCities, truncateForReseed } from "../src/seed";
import { makeCity, setupTestDatabase } from "../src/test-utils/index";

/**
 * `db:seed` must never empty `cities`: the nationwide import's rows and their slug aliases live
 * there, and a reseed used to erase them (`TRUNCATE ... cities CASCADE`).
 */
let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

describe("truncateForReseed", () => {
  it("leaves cities and their slug aliases in place, and re-seeding the 8 is idempotent", async () => {
    const imported = makeCity();
    await cityRepo(db).insert(imported);
    await db
      .insert(citySlugAliases)
      .values({ slug: "old-slug", cityId: imported.id, reason: "renamed" });
    await cityRepo(db).upsertMany(buildCities());

    await truncateForReseed(db);

    expect(await cityRepo(db).findById(imported.id)).not.toBeNull();
    expect(await db.select().from(citySlugAliases)).toHaveLength(1);
    await cityRepo(db).upsertMany(buildCities());
    expect(await db.select().from(cities)).toHaveLength(9);
    expect(await db.select().from(cities).where(eq(cities.slug, "kyiv"))).toHaveLength(1);
  });
});
