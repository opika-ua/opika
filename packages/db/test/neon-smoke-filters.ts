import { randomUUID } from "node:crypto";
import {
  type CityId,
  EVERYONE_SCOPE,
  type FeedFilters,
  NO_FILTERS,
  type RegionId,
} from "@opika/domain";
import type { Database } from "../src/client";
import { REGION_BY_CODE } from "../src/geography/regions-data";
import { animalRepo } from "../src/repos/animal-repo";
import { cityRepo } from "../src/repos/city-repo";
import { galleryRepo } from "../src/repos/gallery-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { citySlugAliases } from "../src/schema/city-slug-aliases";
import { makeAnimal, makeCity, makeShelter } from "../src/test-utils/index";

type Outcome = { name: string; ok: boolean; detail: string };

const NOW = new Date();

/**
 * Nationwide track N3: the oblast filter, the facet roll-up and the token resolver, through
 * neon-http (`neon-smoke.ts` calls this from `main`, after the search steps; no earlier step is
 * edited). Fixtures live in Zakarpattia (UA21), Lviv (UA46) and Crimea (UA01, treated like any region), regions no seeded
 * or production test city is in, so every count below is exact on a child branch of production.
 * Statements are query-builder shapes only (a raw `db.execute` returns a different shape on
 * neon-http). Rows stay on the child branch, which is thrown away; a second run on the same
 * branch doubles them and the counts, so use a fresh one.
 */
export async function runFiltersSmoke(db: Database): Promise<Outcome[]> {
  const out: Outcome[] = [];
  const check = (name: string, ok: boolean, detail: string) => out.push({ name, ok, detail });
  const region = (code: string): RegionId => {
    const found = REGION_BY_CODE.get(code);
    if (!found) throw new Error(`no region ${code}`);
    return found.id;
  };
  const ZAKARPATTIA = region("UA21");
  const LVIV = region("UA46");
  const CRIMEA = region("UA01");

  const place = async (regionId: RegionId, nameUk: string, nameEn: string, animals: number) => {
    const city = makeCity({
      id: randomUUID() as CityId,
      regionId,
      name: { uk: nameUk, en: { text: nameEn, provenance: "human" } },
      slug: `smoke-${randomUUID()}` as never,
    });
    await cityRepo(db).insertMissing([city]);
    if (animals > 0) {
      const shelter = makeShelter({
        displayName: `Смоук ${nameUk}`,
        publicLocation: {
          cityId: city.id,
          district: null,
          precision: "fuzzed_address",
          approximate: { center: { lat: 48.6, lng: 22.3 }, precisionMetres: 1000 } as never,
        },
      });
      await shelterRepo(db).insert(shelter);
      await animalRepo(db).insertMany(
        Array.from({ length: animals }, (_, i) => ({
          animal: makeAnimal({ shelterId: shelter.id, name: `${nameUk} ${i}` }),
          cityId: city.id,
        })),
      );
    }
    return city;
  };

  const uzhhorod = await place(ZAKARPATTIA, "Смоукужгород", "Smokeuzhhorod", 2);
  const mukachevo = await place(ZAKARPATTIA, "Смоукмукачево", "Smokemukachevo", 1);
  const lviv = await place(LVIV, "Смоуклькьів", "Smokelkiv", 2);
  const empty = await place(ZAKARPATTIA, "Смоукпорожній", "Smokeempty", 0);
  const yalta = await place(CRIMEA, "Смоукялта", "Smokeyalta", 1);

  const total = async (filters: FeedFilters): Promise<number> =>
    (
      await galleryRepo(db).list({
        filters,
        scope: EVERYONE_SCOPE,
        sort: "freshest",
        page: 1,
        pageSize: 24,
        now: NOW,
      })
    ).totalMatching;
  const regionsOf = (...values: [RegionId, ...RegionId[]]): FeedFilters["regions"] => ({
    kind: "oneOf",
    values,
  });
  const citiesOf = (...values: [CityId, ...CityId[]]): FeedFilters["cities"] => ({
    kind: "oneOf",
    values,
  });

  const wholeRegion = await total({ ...NO_FILTERS, regions: regionsOf(ZAKARPATTIA) });
  check(
    "an oblast alone lists every animal in its cities (Zakarpattia: 2 + 1)",
    wholeRegion === 3,
    `matching ${wholeRegion}`,
  );

  const narrowed = await total({
    ...NO_FILTERS,
    regions: regionsOf(ZAKARPATTIA),
    cities: citiesOf(uzhhorod.id),
  });
  check(
    "an oblast plus one of its own cities narrows to that city (2)",
    narrowed === 2,
    `matching ${narrowed}`,
  );

  const united = await total({
    ...NO_FILTERS,
    regions: regionsOf(ZAKARPATTIA),
    cities: citiesOf(lviv.id),
  });
  check(
    "a city in another oblast is added to the oblast, not intersected with it (3 + 2)",
    united === 5,
    `matching ${united}`,
  );

  const counts = await galleryRepo(db).facetCounts({
    filters: { ...NO_FILTERS, regions: regionsOf(ZAKARPATTIA) },
    now: NOW,
  });
  const cityCount = new Map(counts.cities.map((c) => [c.cityId as string, c.count]));
  const regionCount = new Map(counts.regions.map((r) => [r.regionId as string, r.count]));
  check(
    "facet counts through neon-http: the cities with animals carry labels, the oblast count is their sum",
    cityCount.get(uzhhorod.id) === 2 &&
      cityCount.get(mukachevo.id) === 1 &&
      cityCount.get(lviv.id) === 2 &&
      regionCount.get(ZAKARPATTIA) === 3 &&
      regionCount.get(LVIV) === 2 &&
      counts.cities.every((c) => c.city.regionId.length > 0),
    `uzhhorod ${cityCount.get(uzhhorod.id)}, mukachevo ${cityCount.get(mukachevo.id)}, lviv ${cityCount.get(lviv.id)}; oblasts ${regionCount.get(ZAKARPATTIA)} / ${regionCount.get(LVIV)}`,
  );

  check(
    "a city with no animal is not offered as an option",
    !cityCount.has(empty.id),
    `offered: ${cityCount.has(empty.id)}`,
  );

  const yaltaOffered = counts.cities.some((c) => c.cityId === yalta.id);
  const crimeaOffered = counts.regions.some((r) => r.regionId === CRIMEA);
  check(
    "Crimea is offered like any region when it has an animal",
    yaltaOffered && crimeaOffered,
    `city offered: ${yaltaOffered}, oblast offered: ${crimeaOffered}`,
  );

  let parity = "";
  for (const city of [uzhhorod, mukachevo, lviv]) {
    const listed = await total({ ...NO_FILTERS, cities: citiesOf(city.id) });
    if (listed !== cityCount.get(city.id))
      parity += ` ${city.id}: count ${cityCount.get(city.id)}, list ${listed};`;
  }
  const zakarpattiaListed = await total({ ...NO_FILTERS, regions: regionsOf(ZAKARPATTIA) });
  if (zakarpattiaListed !== regionCount.get(ZAKARPATTIA))
    parity += ` oblast: count ${regionCount.get(ZAKARPATTIA)}, list ${zakarpattiaListed};`;
  check(
    "every option's count equals what the list shows with that option alone",
    parity === "",
    parity === "" ? "all equal" : parity,
  );

  const aliasSlug = `smoke-old-${randomUUID()}`;
  await db
    .insert(citySlugAliases)
    .values({ slug: aliasSlug, cityId: uzhhorod.id, reason: "renamed" });
  const resolved = await cityRepo(db).resolveTokens([
    uzhhorod.slug,
    aliasSlug,
    mukachevo.id,
    `nowhere-${randomUUID()}`,
  ]);
  const via = resolved.map((r) => `${r.via ?? "none"}:${r.city?.id === undefined ? "-" : "ok"}`);
  check(
    "tokens resolve through neon-http: current slug, former slug, legacy id, unknown",
    resolved[0]?.via === "slug" &&
      resolved[0].city?.id === uzhhorod.id &&
      resolved[1]?.via === "alias" &&
      resolved[1].city?.id === uzhhorod.id &&
      resolved[2]?.via === "id" &&
      resolved[2].city?.id === mukachevo.id &&
      resolved[3]?.via === null &&
      resolved[3].city === null,
    via.join(", "),
  );

  const byIds = await cityRepo(db).findByIds([uzhhorod.id, lviv.id]);
  const none = await cityRepo(db).findByIds([]);
  check(
    "cities are read by id (primary key), and an empty list reads nothing",
    byIds.length === 2 && none.length === 0,
    `${byIds.length} found for 2 ids, ${none.length} for none`,
  );

  return out;
}
