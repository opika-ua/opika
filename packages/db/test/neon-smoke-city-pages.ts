import { randomUUID } from "node:crypto";
import {
  type CityId,
  type ModeratorId,
  NO_FILTERS,
  type ShelterId,
  type ShelterVerification,
} from "@opika/domain";
import type { Database } from "../src/client";
import { animalRepo } from "../src/repos/animal-repo";
import { cityRepo } from "../src/repos/city-repo";
import { galleryRepo } from "../src/repos/gallery-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { makeAnimal, makeCity, makeShelter } from "../src/test-utils/index";

type Outcome = { name: string; ok: boolean; detail: string };

const NOW = new Date();
const DAY = 86_400_000;
const daysBefore = (days: number) => new Date(NOW.getTime() - days * DAY);
const MOD = randomUUID() as ModeratorId;
const EVIDENCE = { items: [], submittedAt: daysBefore(30) };

/**
 * City landing pages (SEO B3) on Neon's driver: `galleryRepo.cityPages` (verified-only basis,
 * effective city, `max()` date, per-species counts, `cityIds`) and the facet grouping's `hasPage`.
 * Fresh cities and shelters only; rows stay on the child branch, which is thrown away.
 */
export async function runCityPagesSmoke(db: Database): Promise<Outcome[]> {
  const out: Outcome[] = [];
  const check = (name: string, ok: boolean, detail: string) => out.push({ name, ok, detail });
  const gallery = galleryRepo(db);

  const freshCity = async () => {
    const city = makeCity({ id: randomUUID() as CityId, slug: `smoke-${randomUUID()}` as never });
    await cityRepo(db).insertMissing([city]);
    return city.id;
  };
  const shelterIn = async (cityId: CityId, verification?: ShelterVerification, early = false) => {
    const shelter = makeShelter({
      displayName: `Смоук міста ${randomUUID().slice(0, 6)}`,
      publicLocation: { precision: "city", cityId, district: null },
      ...(verification ? { verification } : {}),
      ...(early ? { earlyListingSince: daysBefore(3) } : {}),
    });
    await shelterRepo(db).insert(shelter);
    return shelter.id;
  };
  const animalIn = (
    cityId: CityId,
    shelterId: ShelterId,
    extra: Parameters<typeof makeAnimal>[0] = {},
  ) => animalRepo(db).insert(makeAnimal({ shelterId, ...extra }), cityId);

  const pending: ShelterVerification = {
    status: "pending",
    submittedAt: daysBefore(3),
    evidence: EVIDENCE,
  };
  const paused: ShelterVerification = {
    status: "paused",
    verifiedAt: daysBefore(30),
    verifiedBy: MOD,
    pausedAt: daysBefore(2),
    pausedBy: { kind: "moderator", moderatorId: MOD },
    reason: { code: "relocation", note: null },
    evidence: EVIDENCE,
  };

  // A verified shelter in its own city, one cat fostered in another.
  const home = await freshCity();
  const foster = await freshCity();
  const verified = await shelterIn(home);
  await animalIn(foster, verified, { species: "cat" });
  // A city whose only animal belongs to a shelter listed early, its permission running.
  const earlyCity = await freshCity();
  const early = await shelterIn(earlyCity, pending, true);
  await animalIn(earlyCity, early);
  // A city whose only shelter is paused.
  const pausedCity = await freshCity();
  await animalIn(pausedCity, await shelterIn(pausedCity, paused));
  // Dogs and cats from the verified shelter, and a newer update from the early-listed one.
  const mixed = await freshCity();
  await animalIn(mixed, verified, { species: "dog", lastUpdatedAt: daysBefore(9) });
  await animalIn(mixed, verified, { species: "cat", lastUpdatedAt: daysBefore(4) });
  await animalIn(mixed, early, { species: "dog", lastUpdatedAt: daysBefore(1) });

  const pagesOf = async (cityIds: readonly CityId[]) => gallery.cityPages({ now: NOW, cityIds });
  const facet = await gallery.facetCounts({ sort: "freshest", filters: NO_FILTERS, now: NOW });
  const facetEntry = (cityId: CityId) => facet.cities.find((entry) => entry.cityId === cityId);

  const fostered = await pagesOf([home, foster]);
  check(
    "city pages: an animal fostered in another city puts that city up, not its shelter's own",
    fostered.length === 1 && fostered[0]?.cityId === foster,
    `${fostered.length} pages, foster ${fostered[0]?.cityId === foster}`,
  );

  const earlyPages = await pagesOf([earlyCity]);
  check(
    "city pages: a currently early-listed shelter's only city has no page, while the any-listed facet lists it",
    earlyPages.length === 0 && facetEntry(earlyCity) !== undefined,
    `${earlyPages.length} pages, in facet ${facetEntry(earlyCity) !== undefined}`,
  );

  const pausedPages = await pagesOf([pausedCity]);
  check(
    "city pages: a city whose only shelter is paused has no page",
    pausedPages.length === 0,
    `${pausedPages.length} pages`,
  );

  const [mixedPage] = await pagesOf([mixed]);
  const lastModified = mixedPage?.lastModified;
  check(
    "city pages: lastModified is a Date, the newest verified-shelter update (a newer early-listed one ignored)",
    lastModified instanceof Date && lastModified.getTime() === daysBefore(4).getTime(),
    `${lastModified instanceof Date ? lastModified.toISOString() : String(lastModified)} vs ${daysBefore(4).toISOString()}`,
  );

  const [catsOnly] = await pagesOf([foster]);
  check(
    "city pages: species from numeric counts (cats only; dogs and cats)",
    catsOnly?.species.join() === "cat" && mixedPage?.species.join() === "dog,cat",
    `${catsOnly?.species.join()} / ${mixedPage?.species.join()}`,
  );

  check(
    "facet counts: hasPage rides the city grouping (the foster city true, the early-listed city false)",
    facetEntry(foster)?.hasPage === true && facetEntry(earlyCity)?.hasPage === false,
    `foster ${facetEntry(foster)?.hasPage}, early ${facetEntry(earlyCity)?.hasPage}`,
  );

  const narrowed = await pagesOf([foster, mixed, earlyCity]);
  check(
    "city pages: cityIds narrows to the asked cities that have a page",
    narrowed.length === 2 && narrowed.every((row) => row.cityId === foster || row.cityId === mixed),
    `${narrowed.length} pages`,
  );

  let statements = 0;
  const counting = new Proxy(db, {
    get(target, property, receiver) {
      if (property === "select") statements += 1;
      return Reflect.get(target, property, receiver);
    },
  }) as Database;
  const none = await galleryRepo(counting).cityPages({ now: NOW, cityIds: [] });
  check(
    "city pages: an empty cityIds answers [] without a statement",
    none.length === 0 && statements === 0,
    `${none.length} pages, ${statements} statements`,
  );
  return out;
}
