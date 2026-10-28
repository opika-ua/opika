import { randomUUID } from "node:crypto";
import {
  type Animal,
  type AnimalId,
  type CityId,
  EVERYONE_SCOPE,
  type FeedFilters,
  type GalleryScope,
  type GallerySort,
  MAX_GALLERY_NAVIGABLE_ROWS,
  maxNavigablePage,
  NO_FILTERS,
  type ShelterId,
  type ShelterVerification,
} from "@opika/domain";
import type { SQL } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../src/client";
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

async function makeShelterInCity(
  cityId: CityId,
  name = "Тестовий притулок",
  verification?: ShelterVerification,
) {
  const shelter = makeShelter({
    ...(verification ? { verification } : {}),
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
 * A corpus in which confirmation time, publication time and edit time are all
 * *permuted* relative to one another, so each produces a genuinely different
 * order.
 *
 * This matters more than it looks. If any two ran in step, an assertion about
 * one sort mode would pass just as well against a query reading the other
 * column. Two of the three are columns the decisions rejected for a sort:
 * `last_updated_at` for both (a shelter fixing a typo resets it - H2-3 moved
 * `freshest` off it), and `publishedAt` for `freshest` (publishing once says
 * nothing about whether the animal is still looking today).
 */
async function seedPermutedOrderings(shelterId: ShelterId, cityId: CityId, count: number) {
  const animals: Animal[] = Array.from({ length: count }, (_, i) =>
    makeAnimal({
      shelterId,
      name: `Тварина ${i}`,
      // Strides 1, 3 and 5, all coprime to `count` (7), so the three orders are
      // permutations of one another rather than the same order or its reverse.
      // The test asserts they really differ before relying on it. Every
      // confirmation (≤7 days ago) is after every publication (≥30 days ago).
      lastUpdatedAt: daysBefore(((i * 5) % count) + 1),
      listing: {
        kind: "published",
        publishedAt: daysBefore(((i * 3) % count) + 30),
        confirmedAt: daysBefore(i + 1),
        undoable: null,
      },
    }),
  );
  await animalRepo(db).insertMany(animals.map((animal) => ({ animal, cityId })));
  return animals;
}

const publishedAtOf = (animal: Animal): number =>
  animal.listing.kind === "published" ? animal.listing.publishedAt.getTime() : Number.NaN;
const confirmedAtOf = (animal: Animal): number =>
  animal.listing.kind === "published" ? animal.listing.confirmedAt.getTime() : Number.NaN;

describe("galleryRepo.list", () => {
  it("sorts each mode on its own column, which are not the same order", async () => {
    const city = makeCity();
    await cityRepo(db).insert(city);
    const shelter = await makeShelterInCity(city.id);
    const seeded = await seedPermutedOrderings(shelter.id, city.id, 7);

    const gallery = galleryRepo(db);
    const freshest = await gallery.list({
      filters: NO_FILTERS,
      scope: EVERYONE_SCOPE,
      sort: "freshest",
      page: 1,
      pageSize: 10,
      now: NOW,
    });
    const waiting = await gallery.list({
      filters: NO_FILTERS,
      scope: EVERYONE_SCOPE,
      sort: "longest_waiting",
      page: 1,
      pageSize: 10,
      now: NOW,
    });

    const byConfirmedDesc = [...seeded]
      .sort((a, b) => confirmedAtOf(b) - confirmedAtOf(a))
      .map((a) => a.id);
    const byEditDesc = [...seeded]
      .sort((a, b) => b.lastUpdatedAt.getTime() - a.lastUpdatedAt.getTime())
      .map((a) => a.id);
    const byPublishedAsc = [...seeded]
      .sort((a, b) => publishedAtOf(a) - publishedAtOf(b))
      .map((a) => a.id);

    // The guards that make the assertions below mean something: if any two of
    // these agreed, a query reading the wrong column would pass.
    expect(byConfirmedDesc).not.toEqual(byEditDesc);
    expect(byConfirmedDesc).not.toEqual(byPublishedAsc);
    expect(byEditDesc).not.toEqual(byPublishedAsc);

    expect(freshest.items.map((a) => a.id)).toEqual(byConfirmedDesc);
    expect(
      freshest.items.map((a) => a.id),
      "freshest must not follow edit time",
    ).not.toEqual(byEditDesc);
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
      listing: {
        kind: "published",
        publishedAt: longWaitPublishedAt,
        confirmedAt: daysBefore(1),
        undoable: null,
      },
    });
    const newcomer = makeAnimal({
      shelterId: shelter.id,
      name: "Новенький",
      lastUpdatedAt: daysBefore(2),
      listing: {
        kind: "published",
        publishedAt: daysBefore(3),
        confirmedAt: daysBefore(2),
        undoable: null,
      },
    });
    await animalRepo(db).insertMany([
      { animal: oldTimer, cityId: city.id },
      { animal: newcomer, cityId: city.id },
    ]);

    const gallery = galleryRepo(db);
    const before = await gallery.list({
      filters: NO_FILTERS,
      scope: EVERYONE_SCOPE,
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
        listing: {
          kind: "reserved",
          since: NOW,
          publishedAt: longWaitPublishedAt,
          confirmedAt: daysBefore(1),
          undoable: null,
        },
      },
      city.id,
    );

    const after = await gallery.list({
      filters: NO_FILTERS,
      scope: EVERYONE_SCOPE,
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
          scope: EVERYONE_SCOPE,
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
      scope: EVERYONE_SCOPE,
      sort: "freshest",
      page: 7,
      pageSize: PAGE_SIZE,
      now: NOW,
    });

    // Not an empty page reported as a genuine no-match - that would render
    // "nobody matches these filters" for a filter set that plainly does match.
    expect(stale.totalMatching).toBe(6);
    expect(stale.totalPages).toBe(2);
    expect(stale.page).toBe(2);
    expect(stale.items).toHaveLength(2);

    const last = await gallery.list({
      filters: NO_FILTERS,
      scope: EVERYONE_SCOPE,
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
      scope: EVERYONE_SCOPE,
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
      sexes: { kind: "any" },
    };
    const page = await galleryRepo(db).list({
      filters,
      scope: EVERYONE_SCOPE,
      sort: "freshest",
      page: 1,
      pageSize: PAGE_SIZE,
      now: NOW,
    });

    expect(page.items.map((a) => a.id)).toEqual([dogInKyiv.id]);
    expect(page.totalMatching).toBe(1);
  });

  it("hides what the deck hides - drafts, and animals at unverified shelters", async () => {
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
      scope: EVERYONE_SCOPE,
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
    // reported. Verified by mutation - removing the `maxNavigablePage` clamp in
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
      scope: EVERYONE_SCOPE,
      sort: "freshest",
      page: lastNavigable + 1,
      pageSize: PAGE_SIZE,
      now: NOW,
    });

    // The count stays honest - the surface never claims to have found fewer
    // animals than it did - while navigation stops at the bound.
    expect(beyond.totalMatching).toBe(overBound);
    expect(beyond.totalPages).toBe(lastNavigable);
    expect(beyond.page).toBe(lastNavigable);
    expect(beyond.page).toBeLessThanOrEqual(beyond.totalPages);

    // ...and the capped page is the real last navigable page, not an empty one.
    const last = await gallery.list({
      filters: NO_FILTERS,
      scope: EVERYONE_SCOPE,
      sort: "freshest",
      page: lastNavigable,
      pageSize: PAGE_SIZE,
      now: NOW,
    });
    expect(beyond.items.map((a) => a.id)).toEqual(last.items.map((a) => a.id));
    expect(beyond.items.length).toBeGreaterThan(0);

    // A shelter scope sits inside the same bound: its own page links stop at
    // the same depth, and its count stays honest past it.
    const scopedBeyond = await gallery.list({
      filters: NO_FILTERS,
      scope: { kind: "shelter", shelterId: shelter.id },
      sort: "freshest",
      page: lastNavigable + 1,
      pageSize: PAGE_SIZE,
      now: NOW,
    });
    expect(scopedBeyond.totalMatching).toBe(overBound);
    expect(scopedBeyond.totalPages).toBe(lastNavigable);
    expect(scopedBeyond.page).toBe(lastNavigable);
    expect(scopedBeyond.items.map((a) => a.id)).toEqual(last.items.map((a) => a.id));
  });
});

/**
 * The shelter page's list (DR1-D4): the same predicate, sorts, pages and
 * bound as the gallery, narrowed to one shelter.
 */
describe("galleryRepo.list, scoped to one shelter", () => {
  const MODERATOR = randomUUID() as never;
  const EVIDENCE = { items: [], submittedAt: NOW };
  const verifiedFacts = { verifiedAt: NOW, verifiedBy: MODERATOR };
  const notListed: Record<string, ShelterVerification> = {
    unverified: { status: "pending", submittedAt: NOW, evidence: EVIDENCE },
    paused: {
      status: "paused",
      ...verifiedFacts,
      pausedAt: NOW,
      pausedBy: { kind: "moderator", moderatorId: MODERATOR },
      reason: { code: "relocation", note: null },
      evidence: EVIDENCE,
    },
    suspended: {
      status: "suspended",
      suspendedAt: NOW,
      suspendedBy: MODERATOR,
      reason: { code: "unresponsive", note: null },
      priorState: { status: "verified", ...verifiedFacts },
      evidence: EVIDENCE,
    },
  };

  const scopeOf = (shelterId: ShelterId): GalleryScope => ({ kind: "shelter", shelterId });

  /** Every page of one scope and sort, walked in order. */
  async function walk(scope: GalleryScope, sort: GallerySort, pageSize: number) {
    const gallery = galleryRepo(db);
    const first = await gallery.list({
      filters: NO_FILTERS,
      scope,
      sort,
      page: 1,
      pageSize,
      now: NOW,
    });
    const pages = [first];
    for (let page = 2; page <= first.totalPages; page++) {
      pages.push(
        await gallery.list({ filters: NO_FILTERS, scope, sort, page, pageSize, now: NOW }),
      );
    }
    return pages;
  }

  it("lists only that shelter's discoverable animals", async () => {
    const city = makeCity();
    await cityRepo(db).insert(city);
    const own = await makeShelterInCity(city.id, "Свій");
    const other = await makeShelterInCity(city.id, "Інший");
    const ownPublished = makeAnimal({ shelterId: own.id, name: "Свій видимий" });
    const ownReserved = makeAnimal({
      shelterId: own.id,
      name: "Свій заброньований",
      listing: {
        kind: "reserved",
        since: daysBefore(1),
        publishedAt: daysBefore(20),
        confirmedAt: daysBefore(1),
        undoable: null,
      },
    });
    const ownDraft = makeAnimal({
      shelterId: own.id,
      name: "Чернетка",
      listing: { kind: "draft" },
    });
    const otherPublished = makeAnimal({ shelterId: other.id, name: "Чужий" });
    await animalRepo(db).insertMany(
      [ownPublished, ownReserved, ownDraft, otherPublished].map((animal) => ({
        animal,
        cityId: city.id,
      })),
    );

    const page = await galleryRepo(db).list({
      filters: NO_FILTERS,
      scope: scopeOf(own.id),
      sort: "freshest",
      page: 1,
      pageSize: PAGE_SIZE,
      now: NOW,
    });

    expect(page.items.map((a) => a.name).sort()).toEqual(["Свій видимий", "Свій заброньований"]);
    expect(page.totalMatching).toBe(2);
    expect(page.totalShelters).toBe(1);
    expect(page.totalPages).toBe(1);

    // The unscoped list still holds both shelters' animals: the scope narrows
    // this call, it doesn't change what "everyone" means.
    const everyone = await galleryRepo(db).list({
      filters: NO_FILTERS,
      scope: EVERYONE_SCOPE,
      sort: "freshest",
      page: 1,
      pageSize: PAGE_SIZE,
      now: NOW,
    });
    expect(everyone.totalMatching).toBe(3);
  });

  it("is an empty page, with nothing about why, for a shelter that isn't listed", async () => {
    const city = makeCity();
    await cityRepo(db).insert(city);
    const listed = await makeShelterInCity(city.id, "Перевірений");
    const scopes: [string, GalleryScope][] = [["unknown", scopeOf(randomUUID() as ShelterId)]];
    const corpus: Animal[] = [makeAnimal({ shelterId: listed.id, name: "Видимий" })];
    for (const [label, verification] of Object.entries(notListed)) {
      const shelter = await makeShelterInCity(city.id, label, verification);
      corpus.push(makeAnimal({ shelterId: shelter.id, name: `У ${label}` }));
      scopes.push([label, scopeOf(shelter.id)]);
    }
    await animalRepo(db).insertMany(corpus.map((animal) => ({ animal, cityId: city.id })));

    for (const [label, scope] of scopes) {
      for (const sort of ["freshest", "longest_waiting"] as const) {
        const page = await galleryRepo(db).list({
          filters: NO_FILTERS,
          scope,
          sort,
          page: 1,
          pageSize: PAGE_SIZE,
          now: NOW,
        });
        // The same answer for every reason, so the response can't be used to
        // tell a paused shelter from a suspended or a missing one.
        expect({ label, sort, ...page }).toEqual({
          label,
          sort,
          items: [],
          totalMatching: 0,
          totalShelters: 0,
          totalPages: 0,
          page: 1,
        });
      }
    }
  });

  it("orders and pages exactly as the unscoped list does, for both sorts", async () => {
    const city = makeCity();
    await cityRepo(db).insert(city);
    const own = await makeShelterInCity(city.id, "Свій");
    const other = await makeShelterInCity(city.id, "Інший");
    const seeded = await seedPermutedOrderings(own.id, city.id, 7);
    await seedPermutedOrderings(other.id, city.id, 7);
    const ownIds = new Set(seeded.map((a) => a.id));

    for (const sort of ["freshest", "longest_waiting"] as const) {
      const scopedPages = await walk(scopeOf(own.id), sort, 3);
      const everyonePages = await walk(EVERYONE_SCOPE, sort, 3);

      // 7 animals at 3 a page: three pages, the last one partial.
      expect(scopedPages.map((p) => p.page)).toEqual([1, 2, 3]);
      expect(scopedPages.map((p) => p.items.length)).toEqual([3, 3, 1]);
      for (const page of scopedPages) {
        expect(page.totalMatching).toBe(7);
        expect(page.totalPages).toBe(3);
      }

      const scoped = scopedPages.flatMap((p) => p.items.map((a) => a.id));
      const unscopedOwn = everyonePages
        .flatMap((p) => p.items.map((a) => a.id))
        .filter((id) => ownIds.has(id));
      expect(new Set(scoped).size).toBe(7);
      expect(scoped).toEqual(unscopedOwn);
    }
  });

  it("serves a stale page number as the scope's last real page", async () => {
    const city = makeCity();
    await cityRepo(db).insert(city);
    const own = await makeShelterInCity(city.id, "Свій");
    const other = await makeShelterInCity(city.id, "Інший");
    await seedPermutedOrderings(own.id, city.id, 7);
    // Enough animals elsewhere that page 5 exists for everyone but not here.
    await seedPermutedOrderings(other.id, city.id, 14);

    const stale = await galleryRepo(db).list({
      filters: NO_FILTERS,
      scope: scopeOf(own.id),
      sort: "freshest",
      page: 5,
      pageSize: 3,
      now: NOW,
    });
    expect(stale.page).toBe(3);
    expect(stale.totalPages).toBe(3);
    expect(stale.items.length).toBe(1);
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
        sexes: { kind: "any" },
      },
      now: NOW,
    });

    expect(counts.current).toBe(1);

    const byDimension = new Map(counts.relaxations.map((r) => [r.dimension, r.additional]));
    // Ages is unconstrained, so there is no suggestion to make about it - a
    // "+0" row would be noise the design never asked for.
    expect([...byDimension.keys()].sort()).toEqual(["cities", "sizes", "species"]);
    expect(byDimension.get("cities")).toBe(5);
    expect(byDimension.get("sizes")).toBe(3);
    expect(byDimension.get("species")).toBe(2);

    // Most useful suggestion first, so the caller renders an order rather than
    // inventing one.
    expect(counts.relaxations.map((r) => r.additional)).toEqual([5, 3, 2]);
  });

  it("counts the same over a driver whose raw results are `{ rows }`, as neon-http's are", async () => {
    // Production's driver (neon-http, any `.neon.tech` host) returns a raw
    // `db.execute()` result as `{ rows, fields, … }`, not postgres-js's array.
    // The query that read it as an array gave every count 0 there and passed
    // every local test (#112, found in the review of #163). This wrapper gives
    // the local database neon-http's raw shape, so a raw read fails here too.
    const neonHttpRawShape = new Proxy(db, {
      get(target, property, receiver) {
        if (property === "execute") {
          return async (query: SQL) => ({
            rows: Array.from(await target.execute(query)),
            fields: [],
          });
        }
        return Reflect.get(target, property, receiver);
      },
    }) as Database;
    const city = makeCity();
    await cityRepo(db).insert(city);
    const shelter = await makeShelterInCity(city.id);
    await animalRepo(db).insertMany([
      { animal: makeAnimal({ shelterId: shelter.id, species: "cat" }), cityId: city.id },
      { animal: makeAnimal({ shelterId: shelter.id, species: "dog" }), cityId: city.id },
      { animal: makeAnimal({ shelterId: shelter.id, species: "dog" }), cityId: city.id },
    ]);

    const counts = await galleryRepo(neonHttpRawShape).relaxationCounts({
      filters: { ...NO_FILTERS, species: { kind: "oneOf", values: ["cat"] } },
      now: NOW,
    });

    expect(counts).toEqual({ current: 1, relaxations: [{ dimension: "species", additional: 2 }] });
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
    // draft - a relaxation suggestion promising animals the list would not
    // then show is worse than no suggestion.
    expect(counts.current).toBe(0);
    expect(counts.relaxations).toEqual([{ dimension: "species", additional: 1 }]);
  });
});

describe("galleryRepo.neighbours", () => {
  it.each<GallerySort>(["freshest", "longest_waiting"])(
    "walks in exactly %s's own list order, with null at both ends",
    async (sort) => {
      const city = makeCity();
      await cityRepo(db).insert(city);
      const shelter = await makeShelterInCity(city.id);
      const seeded = await seedPermutedOrderings(shelter.id, city.id, 6);

      const gallery = galleryRepo(db);
      const page = await gallery.list({
        filters: NO_FILTERS,
        scope: EVERYONE_SCOPE,
        sort,
        page: 1,
        pageSize: seeded.length,
        now: NOW,
      });
      const order = page.items.map((animal) => animal.id);
      expect(order).toHaveLength(seeded.length);

      for (let i = 0; i < order.length; i++) {
        const neighbours = await gallery.neighbours({
          animalId: order[i] as AnimalId,
          filters: NO_FILTERS,
          scope: EVERYONE_SCOPE,
          sort,
          now: NOW,
        });
        expect(neighbours.prev?.id ?? null, `prev of index ${i}`).toBe(order[i - 1] ?? null);
        expect(neighbours.next?.id ?? null, `next of index ${i}`).toBe(order[i + 1] ?? null);
      }
    },
  );

  it.each<GallerySort>(["freshest", "longest_waiting"])(
    "breaks a tie on id ascending, for %s, matching list() across a page boundary",
    async (sort) => {
      const city = makeCity();
      await cityRepo(db).insert(city);
      const shelter = await makeShelterInCity(city.id);

      // Two groups of three, each sharing one `confirmedAt` and one
      // `waitAnchorAt` within the group - a real tie on both sort columns at
      // once, broken only by `id`. Group A sorts first under both modes
      // (fresher and longer-waiting); the groups are a precondition this
      // test checks before relying on it, same as `seedPermutedOrderings`.
      const tiedPublished = (confirmedAt: Date, publishedAt: Date) => ({
        kind: "published" as const,
        publishedAt,
        confirmedAt,
        undoable: null,
      });
      const groupA = Array.from({ length: 3 }, () =>
        makeAnimal({
          shelterId: shelter.id,
          listing: tiedPublished(daysBefore(1), daysBefore(30)),
        }),
      );
      const groupB = Array.from({ length: 3 }, () =>
        makeAnimal({
          shelterId: shelter.id,
          listing: tiedPublished(daysBefore(10), daysBefore(5)),
        }),
      );
      await animalRepo(db).insertMany(
        [...groupA, ...groupB].map((animal) => ({ animal, cityId: city.id })),
      );

      const byIdAscending = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : 1);
      const expectedOrder = [
        ...[...groupA].sort(byIdAscending),
        ...[...groupB].sort(byIdAscending),
      ].map((animal) => animal.id);
      expect(new Set(expectedOrder).size, "the six ids must be distinct").toBe(6);

      const gallery = galleryRepo(db);

      // Fetched as two separate pages, not one - the walk below must agree
      // with `list()`'s order regardless of where a page happened to end.
      const [page1, page2] = await Promise.all([
        gallery.list({
          filters: NO_FILTERS,
          scope: EVERYONE_SCOPE,
          sort,
          page: 1,
          pageSize: 3,
          now: NOW,
        }),
        gallery.list({
          filters: NO_FILTERS,
          scope: EVERYONE_SCOPE,
          sort,
          page: 2,
          pageSize: 3,
          now: NOW,
        }),
      ]);
      const pagedOrder = [...page1.items, ...page2.items].map((animal) => animal.id);
      expect(pagedOrder, "list() across two pages").toEqual(expectedOrder);

      for (let i = 0; i < expectedOrder.length; i++) {
        const neighbours = await gallery.neighbours({
          animalId: expectedOrder[i] as AnimalId,
          filters: NO_FILTERS,
          scope: EVERYONE_SCOPE,
          sort,
          now: NOW,
        });
        expect(neighbours.prev?.id ?? null, `prev of index ${i}`).toBe(
          expectedOrder[i - 1] ?? null,
        );
        expect(neighbours.next?.id ?? null, `next of index ${i}`).toBe(
          expectedOrder[i + 1] ?? null,
        );
      }
    },
  );

  it("seeks from an animal's own row even once it has dropped out of the current filters", async () => {
    const city = makeCity();
    await cityRepo(db).insert(city);
    const shelter = await makeShelterInCity(city.id);

    // A cat sits immediately adjacent to `catMiddle` on each side (catTrapPrev,
    // catTrapNext) - its *unfiltered* neighbour. If the filter predicate were
    // dropped or ignored, the assertions below would see one of these cats
    // instead of the dog two steps away, and fail - proving the filter is
    // genuinely narrowing the seek, not merely tolerated.
    const published = (confirmedAt: Date) => ({
      kind: "published" as const,
      publishedAt: daysBefore(30),
      confirmedAt,
      undoable: null,
    });
    const dogPrev = makeAnimal({
      shelterId: shelter.id,
      species: "dog",
      listing: published(daysBefore(1)),
    });
    const catTrapPrev = makeAnimal({
      shelterId: shelter.id,
      species: "cat",
      listing: published(daysBefore(2)),
    });
    const catMiddle = makeAnimal({
      shelterId: shelter.id,
      species: "cat",
      listing: published(daysBefore(3)),
    });
    const catTrapNext = makeAnimal({
      shelterId: shelter.id,
      species: "cat",
      listing: published(daysBefore(4)),
    });
    const dogNext = makeAnimal({
      shelterId: shelter.id,
      species: "dog",
      listing: published(daysBefore(5)),
    });
    await animalRepo(db).insertMany(
      [dogPrev, catTrapPrev, catMiddle, catTrapNext, dogNext].map((animal) => ({
        animal,
        cityId: city.id,
      })),
    );

    const dogsOnly: FeedFilters = { ...NO_FILTERS, species: { kind: "oneOf", values: ["dog"] } };

    // The cat itself would never pass `dogsOnly` - this call only works at
    // all because the seek key comes from its own row, not from a position
    // in the filtered set it doesn't have.
    const neighbours = await galleryRepo(db).neighbours({
      animalId: catMiddle.id,
      filters: dogsOnly,
      scope: EVERYONE_SCOPE,
      sort: "freshest",
      now: NOW,
    });

    expect(neighbours.prev?.id).toBe(dogPrev.id);
    expect(neighbours.next?.id).toBe(dogNext.id);
  });

  it("returns null at both ends for an unknown animal id", async () => {
    const city = makeCity();
    await cityRepo(db).insert(city);
    const shelter = await makeShelterInCity(city.id);
    await seedPermutedOrderings(shelter.id, city.id, 3);

    const neighbours = await galleryRepo(db).neighbours({
      animalId: randomUUID() as AnimalId,
      filters: NO_FILTERS,
      scope: EVERYONE_SCOPE,
      sort: "freshest",
      now: NOW,
    });

    expect(neighbours).toEqual({ prev: null, next: null });
  });

  it("returns null at both ends for an animal with no position in either ordering (a draft)", async () => {
    const city = makeCity();
    await cityRepo(db).insert(city);
    const shelter = await makeShelterInCity(city.id);
    const draft = makeAnimal({ shelterId: shelter.id, listing: { kind: "draft" } });
    await animalRepo(db).insertMany([{ animal: draft, cityId: city.id }]);

    const neighbours = await galleryRepo(db).neighbours({
      animalId: draft.id,
      filters: NO_FILTERS,
      scope: EVERYONE_SCOPE,
      sort: "longest_waiting",
      now: NOW,
    });

    expect(neighbours).toEqual({ prev: null, next: null });
  });

  it("narrows to one shelter's own order under a shelter scope", async () => {
    const city = makeCity();
    await cityRepo(db).insert(city);
    const shelterA = await makeShelterInCity(city.id, "Притулок А");
    const shelterB = await makeShelterInCity(city.id, "Притулок Б");

    // Interleaved confirmation times across the two shelters, so a query that
    // forgot the scope predicate would find a different, wrong neighbour.
    const a1 = makeAnimal({
      shelterId: shelterA.id,
      listing: {
        kind: "published",
        publishedAt: daysBefore(30),
        confirmedAt: daysBefore(1),
        undoable: null,
      },
    });
    const b1 = makeAnimal({
      shelterId: shelterB.id,
      listing: {
        kind: "published",
        publishedAt: daysBefore(30),
        confirmedAt: daysBefore(2),
        undoable: null,
      },
    });
    const a2 = makeAnimal({
      shelterId: shelterA.id,
      listing: {
        kind: "published",
        publishedAt: daysBefore(30),
        confirmedAt: daysBefore(3),
        undoable: null,
      },
    });
    await animalRepo(db).insertMany([a1, b1, a2].map((animal) => ({ animal, cityId: city.id })));

    const scope: GalleryScope = { kind: "shelter", shelterId: shelterA.id };
    const neighbours = await galleryRepo(db).neighbours({
      animalId: a1.id,
      filters: NO_FILTERS,
      scope,
      sort: "freshest",
      now: NOW,
    });

    expect(neighbours.prev).toBeNull();
    expect(neighbours.next?.id).toBe(a2.id);
  });
});
