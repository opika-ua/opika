import type { CityId, RegionId } from "@opika/domain";
import { CitySlugSchema } from "@opika/domain";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { REGION_BY_CODE } from "../src/geography/regions-data";
import { withCityIdFromSlug } from "../src/onboard-shelter";
import { cityRepo } from "../src/repos/city-repo";
import { cities } from "../src/schema/cities";
import { citySlugAliases } from "../src/schema/city-slug-aliases";
import { makeCity, setupTestDatabase, truncateAll } from "../src/test-utils/index";

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());
beforeEach(async () => {
  await truncateAll(db);
});

const slug = (s: string) => CitySlugSchema.parse(s);
const regionId = (code: string) => (REGION_BY_CODE.get(code)?.id ?? "") as RegionId;
const raw = (citySlug: string) => ({
  shelter: { displayName: "x", exactAddress: { line1: "a", citySlug } },
  animals: [],
});
const resolveViaScript = (citySlug: string) =>
  withCityIdFromSlug(raw(citySlug), (s) => cityRepo(db).resolveCurrent(s));
const idOf = (resolved: unknown) =>
  (resolved as { shelter: { exactAddress: { cityId: string } } }).shelter.exactAddress.cityId;

describe("onboarding city resolution", () => {
  it("accepts a current settlement", async () => {
    const city = makeCity({ slug: slug("fastiv") });
    await cityRepo(db).insert(city);
    expect(idOf(await resolveViaScript("fastiv"))).toBe(city.id);
  });

  it("refuses a retired settlement, by slug and by its former slug", async () => {
    const city = makeCity({ slug: slug("borova") });
    await cityRepo(db).insert(city);
    await db.update(cities).set({ retiredInEdition: "2026-01" }).where(eq(cities.id, city.id));
    await db
      .insert(citySlugAliases)
      .values({ slug: "borova-old", cityId: city.id, reason: "renamed" });
    await expect(resolveViaScript("borova")).rejects.toThrow(/retired/);
    await expect(resolveViaScript("borova-old")).rejects.toThrow(/retired/);
  });

  it("refuses an unknown slug", async () => {
    await expect(resolveViaScript("atlantis")).rejects.toThrow(/no settlement answers/);
  });

  it("resolves a former slug to the current settlement", async () => {
    const city = makeCity({ slug: slug("brovary-kyivska") });
    await cityRepo(db).insert(city);
    await db
      .insert(citySlugAliases)
      .values({ slug: "brovary", cityId: city.id, reason: "renamed" });
    expect(idOf(await resolveViaScript("brovary"))).toBe(city.id);
  });

  it("accepts Crimea (UA01) and Sevastopol (UA85) like any region", async () => {
    const crimea = makeCity({ slug: slug("simferopol"), regionId: regionId("UA01") });
    const sevastopol = makeCity({ slug: slug("sevastopol"), regionId: regionId("UA85") });
    await cityRepo(db).insertMany([crimea, sevastopol]);
    expect(idOf(await resolveViaScript("simferopol"))).toBe(crimea.id);
    expect(idOf(await resolveViaScript("sevastopol"))).toBe(sevastopol.id);
    expect(await cityRepo(db).findCurrentById(crimea.id as CityId)).not.toBeNull();
  });
});
