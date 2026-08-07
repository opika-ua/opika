import {
  type Animal,
  type CityId,
  type FeedFilters,
  MAX_GALLERY_NAVIGABLE_ROWS,
  maxNavigablePage,
  NO_FILTERS,
  type ShelterId,
} from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { animalRepo } from "../src/repos/animal-repo";
import { cityRepo } from "../src/repos/city-repo";
import { galleryRepo } from "../src/repos/gallery-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import {
  makeAnimal,
  makeCity,
  makeShelter,
  setupTestDatabase,
  truncateAll,
} from "../src/test-utils/index";

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

const NOW = new Date("2026-08-05T12:00:00.000Z");
const PAGE_SIZE = 4;

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

const daysBefore = (days: number): Date => new Date(NOW.getTime() - days * 86_400_000);

async function makeShelterInCity(cityId: CityId, name = "Тестовий притулок") {
  const shelter = makeShelter({
    displayName: name,
    publicLocation: {
      cityId,
      district: null,
      precision: "fuzzed_address",
      approximate: { center: { lat: 50.45, lng: 30.52 }, precisionMetres: 1000 } as never,
    },
    exactAddress: {
      line1: "вул. Тестова 1",
      line2: null,
      postalCode: "01001",
      cityId,
      district: null,
      coordinates: { lat: 50.45, lng: 30.52 },
    },
  });
  await shelterRepo(db).insert(shelter);
  return shelter;
}

/**
 * A corpus in which edit time and publication time are *permuted* relative to
 * one another, so the two sort modes produce genuinely different orders.
 *
 * This matters more than it looks. If `lastUpdatedAt` and `publishedAt` ran in
 * step, both orderings would agree and every assertion about "longest waiting"
 * would pass just as well against a query that had ignored the sort input and
 * read `last_updated_at` — which is precisely the column the decisions doc
 * rejected, because a shelter fixing a typo resets it.
 */
async function seedPermutedOrderings(shelterId: ShelterId, cityId: CityId, count: number) {
  const animals: Animal[] = Array.from({ length: count }, (_, i) =>
    makeAnimal({
      shelterId,
      name: `Тварина ${i}`,
      lastUpdatedAt: daysBefore(i + 1),
      // Stride coprime to `count`, so publication order is a permutation of
      // edit order rather than the same order or its reverse. The test asserts
      // that it really is different before relying on it.
      listing: { kind: "published", publishedAt: daysBefore(((i * 3) % count) + 30) },
    }),
  );
  await animalRepo(db).insertMany(animals.map((animal) => ({ animal, cityId })));
  return animals;
}

const publishedAtOf = (animal: Animal): number =>
  animal.listing.kind === "published" ? animal.listing.publishedAt.getTime() : Number.NaN;

describe("galleryRepo.list", () => {
  it("sorts each mode on its own column, which are not the same order", async () => {
    const city = makeCity();
    await cityRepo(db).insert(city);
    const shelter = await makeShelterInCity(city.id);
    const seeded = await seedPermutedOrderings(shelter.id, city.id, 7);

    const gallery = galleryRepo(db);
    const freshest = await gallery.list({
      filters: NO_FILTERS,
      sort: "freshest",
      page: 1,
      pageSize: 10,
      now: NOW,
    });
    const waiting = await gallery.list({
      filters: NO_FILTERS,
      sort: "longest_waiting",
      page: 1,
      pageSize: 10,
      now: NOW,
    });

    const byEditDesc = [...seeded]
      .sort((a, b) => b.lastUpdatedAt.getTime() - a.lastUpdatedAt.getTime())
      .map((a) => a.id);
    const byPublishedAsc = [...seeded]
      .sort((a, b) => publishedAtOf(a) - publishedAtOf(b))
      .map((a) => a.id);

    // The guard that makes both assertions below mean something: if these two
    // agreed, a query reading `last_updated_at` for both sort modes would pass.
    expect(byEditDesc).not.toEqual(byPublishedAsc);

    expect(freshest.items.map((a) => a.id)).toEqual(byEditDesc);
    expect(waiting.items.map((a) => a.id)).toEqual(byPublishedAsc);
  });

  it("keeps a reserved animal's place in the longest-waiting order", async () => {
    // The product reason the column exists: reservations fall through, so the
    // animal that has waited longest and is provisionally spoken for is exactly
    // the one that should stay at the top of this sort.
    const city = makeCity();
    await cityRepo(db).insert(city);
    const shelter = await makeShelterInCity(city.id);

    const longWaitPublishedAt = daysBefore(120);
    const oldTimer = makeAnimal({
      shelterId: shelter.id,
      name: "Старожил",
      lastUpdatedAt: daysBefore(1),
      listing: { kind: "published", publishedAt: longWaitPublishedAt },
    });
    const newcomer = makeAnimal({
      shelterId: shelter.id,
      name: "Новенький",
      lastUpdatedAt: daysBefore(2),
      listing: { kind: "published", publishedAt: daysBefore(3) },
    });
    await animalRepo(db).insertMany([
      { animal: oldTimer, cityId: city.id },
      { animal: newcomer, cityId: city.id },
    ]);

    const gallery = galleryRepo(db);
    const before = await gallery.list({
      filters: NO_FILTERS,
      sort: "longest_waiting",
      page: 1,
      pageSize: 10,
      now: NOW,
    });
    expect(before.items.map((a) => a.name)).toEqual(["Старожил", "Новенький"]);

    // Reserve it today. A `wait_anchor_at` derived from `since` would drop it
    // to last; carrying `publishedAt` forward leaves it exactly where it was.
    await animalRepo(db).update(
      {
        ...oldTimer,
        listing: { kind: "reserved", since: NOW, publishedAt: longWaitPublishedAt },
      },
      city.id,
    );

    const after = await gallery.list({
      filters: NO_FILTERS,
      sort: "longest_waiting",
      page: 1,
      pageSize: 10,
      now: NOW,
    });
    expect(after.items.map((a) => a.name)).toEqual(["Старожил", "Новенький"]);
  });

  it("pages without overlap or gaps, and reports the totals the links are drawn from", async () => {
    const city = makeCity();
    await cityRepo(db).insert(city);
    const shelterA = await makeShelterInCity(city.id, "Притулок А");
    const shelterB = await makeShelterInCity(city.id, "Притулок Б");

    const animals: Animal[] = Array.from({ length: 10 }, (_, i) =>
      makeAnimal({
        shelterId: i < 6 ? shelterA.id : shelterB.id,
        name: `Тварина ${i}`,
        lastUpdatedAt: daysBefore(i),
      }),
    );
    await animalRepo(db).insertMany(animals.map((animal) => ({ animal, cityId: city.id })));

    const gallery = galleryRepo(db);
    const pages = await Promise.all(
      [1, 2, 3].map((page) =>
        gallery.list({
          filters: NO_FILTERS,
          sort: "freshest",
          page,
          pageSize: PAGE_SIZE,
          now: NOW,
        }),
      ),
    );

    expect(pages.map((p) => p.items.length)).toEqual([4, 4, 2]);
    for (const page of pages) {
      expect(page.totalMatching).toBe(10);
      // A genuinely different aggregate, not derivable from totalMatching.
      expect(page.totalShelters).toBe(2);
      expect(page.totalPages).toBe(3);
    }

    const seen = pages.flatMap((p) => p.items.map((a) => a.id));
    expect(new Set(seen).size).toBe(10);
  });

  it("serves the last real page for a page number that has gone stale", async () => {
    const city = makeCity();
    await cityRepo(db).insert(city);
    const shelter = await makeShelterInCity(city.id);
    await seedPermutedOrderings(shelter.id, city.id, 6);

    const gallery = galleryRepo(db);
    const stale = await gallery.list({
      filters: NO_FILTERS,
      sort: "freshest",
      page: 7,
      pageSize: PAGE_SIZE,
      now: NOW,
    });

    // Not an empty page reported as a genuine no-match — that would render
    // "nobody matches these filters" for a filter set that plainly does match.
    expect(stale.totalMatching).toBe(6);
    expect(stale.totalPages).toBe(2);
    expect(stale.page).toBe(2);
    expect(stale.items).toHaveLength(2);

    const last = await gallery.list({
      filters: NO_FILTERS,
      sort: "freshest",
      page: 2,
      pageSize: PAGE_SIZE,
      now: NOW,
    });
    expect(stale.items.map((a) => a.id)).toEqual(last.items.map((a) => a.id));
  });

  it("reports a real no-match distinguishably from a stale page", async () => {
    const city = makeCity();
    await cityRepo(db).insert(city);
    const shelter = await makeShelterInCity(city.id);
    await seedPermutedOrderings(shelter.id, city.id, 3);

    const noMatch = await galleryRepo(db).list({
      filters: { ...NO_FILTERS, species: { kind: "oneOf", values: ["cat"] } },
      sort: "freshest",
      page: 1,
      pageSize: PAGE_SIZE,
      now: NOW,
    });

    expect(noMatch.items).toHaveLength(0);
    expect(noMatch.totalMatching).toBe(0);
    expect(noMatch.totalShelters).toBe(0);
    expect(noMatch.totalPages).toBe(0);
    expect(noMatch.page).toBe(1);
  });

  it("applies the same filters the deck does", async () => {
    const kyiv = makeCity();
    const lviv = makeCity();
    await cityRepo(db).insert(kyiv);
    await cityRepo(db).insert(lviv);
    const shelter = await makeShelterInCity(kyiv.id);

    const dogInKyiv = makeAnimal({ shelterId: shelter.id, species: "dog", size: "small" });
    const catInKyiv = makeAnimal({ shelterId: shelter.id, species: "cat", size: "small" });
    const dogInLviv = makeAnimal({ shelterId: shelter.id, species: "dog", size: "large" });
    await animalRepo(db).insertMany([
      { animal: dogInKyiv, cityId: kyiv.id },
      { animal: catInKyiv, cityId: kyiv.id },
      { animal: dogInLviv, cityId: lviv.id },
    ]);

    const filters: FeedFilters = {
      cities: { kind: "oneOf", values: [kyiv.id] },
      species: { kind: "oneOf", values: ["dog"] },
      sizes: { kind: "oneOf", values: ["small"] },
      ages: { kind: "any" },
    };
    const page = await galleryRepo(db).list({
      filters,
      sort: "freshest",
      page: 1,
      pageSize: PAGE_SIZE,
      now: NOW,
    });

    expect(page.items.map((a) => a.id)).toEqual([dogInKyiv.id]);
    expect(page.totalMatching).toBe(1);
  });

  it("hides what the deck hides — drafts, and animals at unverified shelters", async () => {
    const city = makeCity();
    await cityRepo(db).insert(city);
    const verified = await makeShelterInCity(city.id, "Перевірений");
    const pending = makeShelter({
      displayName: "Очікує",
      publicLocation: {
        cityId: city.id,
        district: null,
        precision: "fuzzed_address",
        approximate: { center: { lat: 50.45, lng: 30.52 }, precisionMetres: 1000 } as never,
      },
      exactAddress: {
        line1: "вул. Тестова 2",
        line2: null,
        postalCode: "01001",
        cityId: city.id,
        district: null,
        coordinates: { lat: 50.45, lng: 30.52 },
      },
      verification: {
        status: "pending",
        submittedAt: NOW,
        evidence: { items: [], submittedAt: NOW },
      },
    });
    await shelterRepo(db).insert(pending);

    const visible = makeAnimal({ shelterId: verified.id, name: "Видимий" });
    const draft = makeAnimal({
      shelterId: verified.id,
      name: "Чернетка",
      listing: { kind: "draft" },
    });
    const atPending = makeAnimal({ shelterId: pending.id, name: "У неперевіреного" });
    await animalRepo(db).insertMany([
      { animal: visible, cityId: city.id },
      { animal: draft, cityId: city.id },
      { animal: atPending, cityId: city.id },
    ]);

    const page = await galleryRepo(db).list({
      filters: NO_FILTERS,
      sort: "longest_waiting",
      page: 1,
      pageSize: PAGE_SIZE,
      now: NOW,
    });

    expect(page.items.map((a) => a.name)).toEqual(["Видимий"]);
    expect(page.totalMatching).toBe(1);
  });

  it("caps navigable pages at the bound while reporting the true total", async () => {
    // Seeded past the bound rather than asserted arithmetically. The cap has to
    // hold in the *query*, not only in `galleryPageCount`: past the bound there
    // are still rows under the offset, so a repo that clamped nothing would
    // return a full page and a `page` greater than the `totalPages` it had just
    // reported. Verified by mutation — removing the `maxNavigablePage` clamp in
    // `galleryRepo.list` makes this fail with page 85 against totalPages 84.
    const city = makeCity();
    await cityRepo(db).insert(city);
    const shelter = await makeShelterInCity(city.id);

    const overBound = MAX_GALLERY_NAVIGABLE_ROWS + 100;
    const corpus: Animal[] = Array.from({ length: overBound }, (_, i) =>
      makeAnimal({
        shelterId: shelter.id,
        name: `Тварина ${i}`,
        lastUpdatedAt: new Date(NOW.getTime() - i * 60_000),
      }),
    );
    const repo = animalRepo(db);
    for (let i = 0; i < corpus.length; i += 250) {
      await repo.insertMany(
        corpus.slice(i, i + 250).map((animal) => ({ animal, cityId: city.id })),
      );
    }

    const gallery = galleryRepo(db);
    const lastNavigable = maxNavigablePage(PAGE_SIZE);
    const beyond = await gallery.list({
      filters: NO_FILTERS,
      sort: "freshest",
      page: lastNavigable + 1,
      pageSize: PAGE_SIZE,
      now: NOW,
    });

    // The count stays honest — the surface never claims to have found fewer
    // animals than it did — while navigation stops at the bound.
    expect(beyond.totalMatching).toBe(overBound);
    expect(beyond.totalPages).toBe(lastNavigable);
    expect(beyond.page).toBe(lastNavigable);
    expect(beyond.page).toBeLessThanOrEqual(beyond.totalPages);

    // ...and the capped page is the real last navigable page, not an empty one.
    const last = await gallery.list({
      filters: NO_FILTERS,
      sort: "freshest",
      page: lastNavigable,
      pageSize: PAGE_SIZE,
      now: NOW,
    });
    expect(beyond.items.map((a) => a.id)).toEqual(last.items.map((a) => a.id));
    expect(beyond.items.length).toBeGreaterThan(0);
  });
});

describe("galleryRepo.relaxationCounts", () => {
  it("counts only the dimensions actually constrained, as gains over the current match", async () => {
    const kyiv = makeCity();
    const lviv = makeCity();
    await cityRepo(db).insert(kyiv);
    await cityRepo(db).insert(lviv);
    const shelter = await makeShelterInCity(kyiv.id);

    // 1 small dog in Kyiv (the current match), 3 more dogs in Kyiv of other
    // sizes, 2 small cats in Kyiv, 5 small dogs in Lviv.
    const entries = [
      ...Array.from({ length: 1 }, () => ({
        animal: makeAnimal({
          shelterId: shelter.id,
          species: "dog" as const,
          size: "small" as const,
        }),
        cityId: kyiv.id,
      })),
      ...Array.from({ length: 3 }, () => ({
        animal: makeAnimal({
          shelterId: shelter.id,
          species: "dog" as const,
          size: "large" as const,
        }),
        cityId: kyiv.id,
      })),
      ...Array.from({ length: 2 }, () => ({
        animal: makeAnimal({
          shelterId: shelter.id,
          species: "cat" as const,
          size: "small" as const,
        }),
        cityId: kyiv.id,
      })),
      ...Array.from({ length: 5 }, () => ({
        animal: makeAnimal({
          shelterId: shelter.id,
          species: "dog" as const,
          size: "small" as const,
        }),
        cityId: lviv.id,
      })),
    ];
    await animalRepo(db).insertMany(entries);

    const counts = await galleryRepo(db).relaxationCounts({
      filters: {
        cities: { kind: "oneOf", values: [kyiv.id] },
        species: { kind: "oneOf", values: ["dog"] },
        sizes: { kind: "oneOf", values: ["small"] },
        ages: { kind: "any" },
      },
      now: NOW,
    });

    expect(counts.current).toBe(1);

    const byDimension = new Map(counts.relaxations.map((r) => [r.dimension, r.additional]));
    // Ages is unconstrained, so there is no suggestion to make about it — a
    // "+0" row would be noise the design never asked for.
    expect([...byDimension.keys()].sort()).toEqual(["cities", "sizes", "species"]);
    expect(byDimension.get("cities")).toBe(5);
    expect(byDimension.get("sizes")).toBe(3);
    expect(byDimension.get("species")).toBe(2);

    // Most useful suggestion first, so the caller renders an order rather than
    // inventing one.
    expect(counts.relaxations.map((r) => r.additional)).toEqual([5, 3, 2]);
  });

  it("makes no suggestions when nothing is filtered", async () => {
    const city = makeCity();
    await cityRepo(db).insert(city);
    const shelter = await makeShelterInCity(city.id);
    await seedPermutedOrderings(shelter.id, city.id, 3);

    const counts = await galleryRepo(db).relaxationCounts({ filters: NO_FILTERS, now: NOW });

    expect(counts.current).toBe(3);
    expect(counts.relaxations).toEqual([]);
  });

  it("counts against the same visibility rules the list uses", async () => {
    const city = makeCity();
    await cityRepo(db).insert(city);
    const shelter = await makeShelterInCity(city.id);

    const published = makeAnimal({ shelterId: shelter.id, species: "cat" });
    const draft = makeAnimal({
      shelterId: shelter.id,
      species: "cat",
      listing: { kind: "draft" },
    });
    await animalRepo(db).insertMany([
      { animal: published, cityId: city.id },
      { animal: draft, cityId: city.id },
    ]);

    const counts = await galleryRepo(db).relaxationCounts({
      filters: { ...NO_FILTERS, species: { kind: "oneOf", values: ["dog"] } },
      now: NOW,
    });

    // Dropping the species filter reveals the one published cat, never the
    // draft — a relaxation suggestion promising animals the list would not
    // then show is worse than no suggestion.
    expect(counts.current).toBe(0);
    expect(counts.relaxations).toEqual([{ dimension: "species", additional: 1 }]);
  });
});
