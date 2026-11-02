import { randomUUID } from "node:crypto";
import { type CityId, EVERYONE_SCOPE, MAX_GALLERY_NAVIGABLE_ROWS, NO_FILTERS } from "@opika/domain";
import type { Database } from "../src/client";
import { animalRepo } from "../src/repos/animal-repo";
import { cityRepo } from "../src/repos/city-repo";
import { galleryRepo } from "../src/repos/gallery-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { makeAnimal, makeCity, makeShelter } from "../src/test-utils/index";

type Outcome = { name: string; ok: boolean; detail: string };

const NOW = new Date();

/**
 * Round-trip PR: the statements that read a card's animal, shelter and city together (JOINs, a
 * nested select whose joined object is null when the row is absent) and the sitemap's single
 * read, through neon-http. `neon-smoke.ts` calls this from `main`; no earlier step is edited.
 * Fixtures: two cities, a verified shelter, a published animal at the shelter's city, a fostered
 * one in the other city and a draft, so every count is exact on a child branch of production.
 * Rows stay on the child branch, which is thrown away; use a fresh one.
 */
export async function runRoundTripsSmoke(db: Database): Promise<Outcome[]> {
  const out: Outcome[] = [];
  const check = (name: string, ok: boolean, detail: string) => out.push({ name, ok, detail });

  const home = makeCity({ id: randomUUID() as CityId, slug: `smoke-${randomUUID()}` as never });
  const away = makeCity({ id: randomUUID() as CityId, slug: `smoke-${randomUUID()}` as never });
  await cityRepo(db).insertMissing([home, away]);
  const shelter = makeShelter({
    displayName: `Смоук карток ${home.id.slice(0, 6)}`,
    publicLocation: {
      cityId: home.id,
      district: null,
      precision: "fuzzed_address",
      approximate: { center: { lat: 50.4, lng: 30.5 }, precisionMetres: 1000 } as never,
    },
  });
  await shelterRepo(db).insert(shelter);
  const atHome = makeAnimal({ shelterId: shelter.id, name: "Смоук вдома" });
  const fostered = makeAnimal({
    shelterId: shelter.id,
    name: "Смоук тимчасова",
    publicLocation: { precision: "city", cityId: away.id, district: null },
  });
  const draft = makeAnimal({
    shelterId: shelter.id,
    name: "Смоук чернетка",
    listing: { kind: "draft" },
  });
  await animalRepo(db).insertMany([
    { animal: atHome, cityId: home.id },
    { animal: fostered, cityId: away.id },
    { animal: draft, cityId: home.id },
  ]);

  const list = async (cityId: CityId) =>
    galleryRepo(db).listCards({
      filters: { ...NO_FILTERS, cities: { kind: "oneOf", values: [cityId] } },
      scope: EVERYONE_SCOPE,
      sort: "freshest",
      page: 1,
      pageSize: 24,
      now: NOW,
    });
  const homePage = await list(home.id);
  const awayPage = await list(away.id);
  check(
    "listCards (animals JOIN shelters LEFT JOIN cities): one card per city, shelter and city read with it",
    homePage.totalMatching === 1 &&
      homePage.totalShelters === 1 &&
      homePage.items[0]?.animal.id === atHome.id &&
      homePage.items[0]?.shelter.displayName === shelter.displayName &&
      homePage.items[0]?.shelter.verification === "verified" &&
      homePage.items[0]?.city?.id === home.id &&
      awayPage.items[0]?.animal.id === fostered.id &&
      awayPage.items[0]?.city?.id === away.id,
    `home ${homePage.totalMatching}/${homePage.totalShelters}, away ${awayPage.totalMatching}`,
  );

  const none = await galleryRepo(db).listCards({
    filters: { ...NO_FILTERS, cities: { kind: "oneOf", values: [randomUUID() as CityId] } },
    scope: EVERYONE_SCOPE,
    sort: "freshest",
    page: 1,
    pageSize: 24,
    now: NOW,
  });
  check(
    "listCards: no match answers an empty page with zero totals",
    none.items.length === 0 && none.totalMatching === 0 && none.totalPages === 0,
    `${none.items.length} items, total ${none.totalMatching}`,
  );

  const one = await animalRepo(db).findWithShelterById(atHome.id);
  const draftOne = await animalRepo(db).findWithShelterById(draft.id);
  const unknown = await animalRepo(db).findWithShelterById(randomUUID() as never);
  check(
    "findWithShelterById (animal LEFT JOIN shelter): the shelter rides along; a draft still resolves; an unknown id is null",
    one?.shelter?.id === shelter.id &&
      one.shelter.publicLocation.cityId === home.id &&
      draftOne?.animal.listing.kind === "draft" &&
      unknown === null,
    `${one?.shelter?.displayName ?? "none"}, draft ${draftOne?.animal.listing.kind}, unknown ${unknown}`,
  );

  const cards = await animalRepo(db).findCardsByIds([
    atHome.id,
    fostered.id,
    draft.id,
    randomUUID() as never,
  ]);
  const byId = new Map(cards.map((c) => [c.animal.id, c]));
  check(
    "findCardsByIds (animals LEFT JOIN shelters LEFT JOIN cities): the fostered card names the foster city, an unknown id is absent",
    cards.length === 3 &&
      byId.get(atHome.id)?.city?.id === home.id &&
      byId.get(fostered.id)?.city?.id === away.id &&
      byId.get(draft.id)?.shelter?.id === shelter.id,
    `${cards.length} rows`,
  );

  // The expectation is the capped one: the gallery's total, never above the bound. A branch with
  // more public animals than the bound (or newer ones than the fixtures) lists only the freshest
  // 2,000, so the fixtures are required in the list only when everything fits.
  const sitemap = await galleryRepo(db).sitemapRows({ now: NOW });
  const few = await galleryRepo(db).sitemapRows({ now: NOW, limit: 3 });
  const everything = await galleryRepo(db).listCards({
    filters: NO_FILTERS,
    scope: EVERYONE_SCOPE,
    sort: "freshest",
    page: 1,
    pageSize: 1,
    now: NOW,
  });
  const ids = new Set(sitemap.map((r) => r.id as string));
  const expectedLength = Math.min(everything.totalMatching, MAX_GALLERY_NAVIGABLE_ROWS);
  const fits = everything.totalMatching <= MAX_GALLERY_NAVIGABLE_ROWS;
  check(
    "sitemapRows: one statement, the gallery's total capped at the navigable bound, no draft; both fixtures when all fit",
    sitemap.length === expectedLength &&
      few.length === Math.min(3, expectedLength) &&
      !ids.has(draft.id) &&
      (!fits || (ids.has(atHome.id) && ids.has(fostered.id))),
    `${sitemap.length} rows of ${everything.totalMatching} public`,
  );
  return out;
}
