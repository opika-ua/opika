import { eq, ne } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cityRepo } from "../src/repos/city-repo";
import { cities } from "../src/schema/cities";
import { citySlugAliases } from "../src/schema/city-slug-aliases";
import { buildCities } from "../src/seed";
import { setupTestDatabase, truncateAll } from "../src/test-utils/index";
import { runGeographySmoke } from "./neon-smoke-geography";

/** The nationwide N1 smoke steps, proven locally first (postgres-js). */
describe("runGeographySmoke against the local database", () => {
  let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
  let cleanup: () => Promise<void>;
  beforeAll(async () => {
    ({ db, cleanup } = await setupTestDatabase());
  });
  afterAll(async () => cleanup?.());

  it("passes every check, and there are 10", async () => {
    // A child branch of production already holds these 8; the local database starts empty.
    await cityRepo(db).insertMissing(buildCities());
    const outcomes = await runGeographySmoke(db);
    expect(outcomes.filter((o) => !o.ok)).toEqual([]);
    expect(outcomes).toHaveLength(10);
    expect(outcomes.at(-1)?.detail).toBe("seeded cities present: 8, wrong: 0");
  });

  it("fails when no seeded city exists", async () => {
    await truncateAll(db);
    const outcomes = await runGeographySmoke(db);
    const last = outcomes.at(-1);
    expect(last?.ok).toBe(false);
    expect(last?.detail).toBe("seeded cities present: 0, wrong: 0");
  });

  // The shape of a production copy after the settlement import.
  const renameLikeImport = async () => {
    await truncateAll(db);
    await cityRepo(db).insertMissing(buildCities());
    const list = await db
      .select({ id: cities.id, slug: cities.slug })
      .from(cities)
      .where(ne(cities.slug, "kyiv"));
    for (const r of list) {
      await db.insert(citySlugAliases).values({ slug: r.slug, cityId: r.id, reason: "legacy" });
      await db
        .update(cities)
        .set({ slug: `${r.slug}-kyivska` })
        .where(eq(cities.id, r.id));
    }
    return list.length;
  };

  it("finds the 7 renamed cities through their legacy aliases", async () => {
    expect(await renameLikeImport()).toBe(7);
    const outcomes = await runGeographySmoke(db);
    expect(outcomes.at(-1)?.detail).toBe("seeded cities present: 8, wrong: 0");
    expect(outcomes.at(-1)?.ok).toBe(true);
  });

  it("still flags a renamed city in the wrong region", async () => {
    await renameLikeImport();
    await db.update(cities).set({ kind: "village" }).where(eq(cities.slug, "brovary-kyivska"));
    const last = (await runGeographySmoke(db)).at(-1);
    expect(last?.ok).toBe(false);
    expect(last?.detail).toBe("seeded cities present: 8, wrong: 1");
  });
});
