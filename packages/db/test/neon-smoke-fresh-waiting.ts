import { randomUUID } from "node:crypto";
import {
  type CityId,
  DEFAULT_FRESHNESS_POLICY,
  EVERYONE_SCOPE,
  type FeedFilters,
  type GalleryScope,
  type GallerySort,
  NO_FILTERS,
  staleCutoff,
} from "@opika/domain";
import type { Database } from "../src/client";
import { animalRepo } from "../src/repos/animal-repo";
import { cityRepo } from "../src/repos/city-repo";
import { galleryRepo } from "../src/repos/gallery-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { makeAnimal, makeCity, makeShelter } from "../src/test-utils/index";

type Outcome = { name: string; ok: boolean; detail: string };

const MS_PER_DAY = 86_400_000;

/**
 * «Зачекались» leaves stale cards out (owner, 2026-11-24), through neon-http: the list, its count,
 * the facet and relaxation counts and the neighbours under `longest_waiting`, and the same reads
 * under `freshest`, which still lists every card. Every read is narrowed to a city (or a shelter)
 * made for this run, so rows already on the branch (production's, an earlier run's) cannot move a
 * count. The stale card sits exactly on `staleCutoff`, so the strict `>` is what is checked on Neon.
 */
export async function runFreshWaitingSmoke(db: Database): Promise<Outcome[]> {
  const out: Outcome[] = [];
  const check = (name: string, ok: boolean, detail: string) => out.push({ name, ok, detail });
  const now = new Date();
  const gallery = galleryRepo(db);

  const city = makeCity({
    id: randomUUID() as CityId,
    name: { uk: "Смоукзачекались", en: { text: "Smokewaiting", provenance: "human" } },
    slug: `smoke-${randomUUID()}` as never,
  });
  await cityRepo(db).insertMissing([city]);
  const shelter = makeShelter({
    displayName: "Смоук Зачекались",
    publicLocation: {
      cityId: city.id,
      district: null,
      precision: "fuzzed_address",
      approximate: { center: { lat: 50.45, lng: 30.52 }, precisionMetres: 1000 } as never,
    },
  });
  await shelterRepo(db).insert(shelter);
  const animal = (
    name: string,
    confirmedAt: Date,
    publishedDaysAgo: number,
    species: "dog" | "cat",
  ) =>
    makeAnimal({
      shelterId: shelter.id,
      name,
      species,
      listing: {
        kind: "published",
        publishedAt: new Date(now.getTime() - publishedDaysAgo * MS_PER_DAY),
        confirmedAt,
        undoable: null,
      },
    });
  const fresh = animal("Смоук свіжий", new Date(now.getTime() - MS_PER_DAY), 100, "dog");
  const thirty = animal(
    "Смоук тридцять днів",
    new Date(now.getTime() - 30 * MS_PER_DAY),
    90,
    "cat",
  );
  // The newest confirmation the domain calls stale; it has waited longest of the three.
  const stale = animal("Смоук застарілий", staleCutoff(now, DEFAULT_FRESHNESS_POLICY), 200, "dog");
  await animalRepo(db).insertMany(
    [fresh, thirty, stale].map((row) => ({ animal: row, cityId: city.id })),
  );

  const inCity: FeedFilters = { ...NO_FILTERS, cities: { kind: "oneOf", values: [city.id] } };
  const list = (sort: GallerySort, scope: GalleryScope = EVERYONE_SCOPE, filters = inCity) =>
    gallery.list({ filters, scope, sort, page: 1, pageSize: 24, now });
  const names = (page: { items: readonly { name: string }[] }) =>
    page.items.map((item) => item.name).join(", ");

  const waiting = await list("longest_waiting");
  check(
    "«Зачекались» lists the 30-day card and leaves out the one on the stale cutoff (neon-http)",
    waiting.totalMatching === 2 &&
      waiting.items.map((a) => a.id).join() === [fresh.id, thirty.id].join() &&
      waiting.totalPages === 1,
    `${waiting.totalMatching} matching: ${names(waiting)}`,
  );

  const freshest = await list("freshest");
  check(
    "the freshest sort still lists every card, the stale one included",
    freshest.totalMatching === 3 &&
      freshest.items.map((a) => a.id).join() === [fresh.id, thirty.id, stale.id].join(),
    `${freshest.totalMatching} matching: ${names(freshest)}`,
  );

  const facetsOf = async (sort: GallerySort) => {
    const counts = await gallery.facetCounts({ filters: inCity, sort, now });
    return {
      city: counts.cities.find((c) => c.cityId === city.id),
      species: counts.species,
    };
  };
  const waitingFacets = await facetsOf("longest_waiting");
  const freshestFacets = await facetsOf("freshest");
  check(
    "facet counts follow the sort: the stale card is counted under the freshest sort only, and the city stays offered",
    waitingFacets.city?.count === 2 &&
      waitingFacets.species.dog === 1 &&
      waitingFacets.species.cat === 1 &&
      freshestFacets.city?.count === 3 &&
      freshestFacets.species.dog === 2 &&
      freshestFacets.species.cat === 1,
    `«Зачекались»: city ${waitingFacets.city?.count}, dog ${waitingFacets.species.dog}, cat ${waitingFacets.species.cat}; freshest: city ${freshestFacets.city?.count}, dog ${freshestFacets.species.dog}, cat ${freshestFacets.species.cat}`,
  );

  const catsInCity: FeedFilters = { ...inCity, species: { kind: "oneOf", values: ["cat"] } };
  const speciesGain = async (sort: GallerySort) => {
    const counts = await gallery.relaxationCounts({ filters: catsInCity, sort, now });
    return {
      current: counts.current,
      gain: counts.relaxations.find((r) => r.dimension === "species")?.additional,
    };
  };
  const waitingGain = await speciesGain("longest_waiting");
  const freshestGain = await speciesGain("freshest");
  check(
    "relaxation counts follow the sort: dropping «Коти» adds 1 under «Зачекались», 2 under the freshest sort",
    waitingGain.current === 1 &&
      waitingGain.gain === 1 &&
      freshestGain.current === 1 &&
      freshestGain.gain === 2,
    `«Зачекались»: current ${waitingGain.current}, +${waitingGain.gain}; freshest: current ${freshestGain.current}, +${freshestGain.gain}`,
  );

  const around = (animalId: typeof fresh.id, sort: GallerySort) =>
    gallery.neighbours({ animalId, filters: inCity, scope: EVERYONE_SCOPE, sort, now });
  const waitingStart = await around(fresh.id, "longest_waiting");
  const freshestEnd = await around(thirty.id, "freshest");
  check(
    "neighbours follow the sort: no stale card before the first under «Зачекались», the stale one last under the freshest sort",
    waitingStart.prev === null &&
      waitingStart.next?.id === thirty.id &&
      freshestEnd.next?.id === stale.id,
    `«Зачекались» around the fresh card: prev ${waitingStart.prev?.name ?? "none"}, next ${waitingStart.next?.name ?? "none"}; freshest after the 30-day card: ${freshestEnd.next?.name ?? "none"}`,
  );

  const scope: GalleryScope = { kind: "shelter", shelterId: shelter.id };
  const shelterWaiting = await list("longest_waiting", scope, NO_FILTERS);
  const shelterFreshest = await list("freshest", scope, NO_FILTERS);
  const shelterCounts = await gallery.facetCounts({
    filters: NO_FILTERS,
    sort: "longest_waiting",
    scope,
    now,
  });
  check(
    "a shelter's own page under «Зачекались»: 2 listed and counted, 3 under the freshest sort",
    shelterWaiting.totalMatching === 2 &&
      shelterCounts.species.dog + shelterCounts.species.cat === 2 &&
      shelterFreshest.totalMatching === 3,
    `«Зачекались» ${shelterWaiting.totalMatching} (counted ${shelterCounts.species.dog + shelterCounts.species.cat}); freshest ${shelterFreshest.totalMatching}`,
  );

  return out;
}
