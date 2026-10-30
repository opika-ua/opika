import type { FeedCardView, GalleryFacetCounts, PublicShelterView } from "@opika/contracts";
import { NO_FILTERS } from "@opika/domain";
import { ORPCError } from "@orpc/server";
import { vi } from "vitest";
import { makeDetailShelter } from "../animal-detail/test-fixtures";
import type { ShelterPageClient, ShelterPageView } from "./shelter-page-load";

export const SHELTER_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
export const CITY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/** The sentence a shelter wrote, used wherever a test needs one to look for. */
export const SENTENCE = "Оновлюємо картки щосуботи, пишіть у будь-який день.";
export const DESCRIPTION = "Невеликий притулок на околиці міста, працюємо з 2019 року.";

export function makeShelterPageShelter(
  overrides: Partial<PublicShelterView> = {},
): PublicShelterView {
  return makeDetailShelter({
    displayName: "Лапа допомоги",
    description: { uk: DESCRIPTION, en: null },
    freshnessSentence: { uk: SENTENCE, en: null },
    ...overrides,
  });
}

export function makeCardView(index: number, overrides: Partial<FeedCardView> = {}): FeedCardView {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}` as FeedCardView["id"],
    name: `Тварина ${index}`,
    species: "dog",
    sex: "female",
    size: "medium",
    coatLength: null,
    ageBucket: "adult",
    publicLocation: null,
    primaryPhoto: null,
    freshness: { kind: "fresh", ageDays: 2, confirmedAt: new Date("2026-10-19T00:00:00Z") },
    listingKind: "published",
    shelter: {
      id: SHELTER_ID as FeedCardView["shelter"]["id"],
      displayName: "Лапа допомоги",
      logo: null,
      publicLocation: { cityId: CITY_ID as never },
      verification: "verified",
    },
    ...overrides,
  };
}

type ListOutput = ShelterPageView["animals"];

export function makeListOutput(cards: FeedCardView[], page = 1, totalPages = 1): ListOutput {
  return {
    items: cards,
    totalMatching: cards.length + (totalPages - 1) * 24,
    totalShelters: cards.length > 0 ? 1 : 0,
    totalPages,
    page,
    cityLabels: [],
  };
}

export function makeShelterPageView(overrides: Partial<ShelterPageView> = {}): ShelterPageView {
  return {
    shelter: makeShelterPageShelter(),
    cityName: "Бровари",
    cityPlace: "м. Бровари",
    animals: makeListOutput([makeCardView(1), makeCardView(2)]),
    cityNames: new Map([[CITY_ID as never, "Бровари"]]),
    query: { sort: "freshest", page: 1, filters: NO_FILTERS },
    filterUi: null,
    ...overrides,
  };
}

/** What `shelters.byId` does in a test: answer, refuse with an oRPC code, or fail outright. */
export type ShelterByIdBehaviour =
  | { kind: "answer"; shelter?: PublicShelterView }
  | { kind: "refuse"; code: "NOT_FOUND" | "RATE_LIMITED" }
  | { kind: "fail" };

export function stubShelterPageClient(
  byId: ShelterByIdBehaviour = { kind: "answer" },
  list: ListOutput = makeListOutput([makeCardView(1)]),
) {
  const sheltersById = vi.fn(async () => {
    switch (byId.kind) {
      case "answer":
        return byId.shelter ?? makeShelterPageShelter();
      case "refuse":
        throw new ORPCError(byId.code);
      case "fail":
        throw new Error("connection terminated");
    }
  });
  const galleryList = vi.fn(async () => list);
  const facetCounts = vi.fn(async () => makeFacetCounts());
  const relaxationCounts = vi.fn(async () => ({ current: 0, relaxations: [] }));
  const client = {
    shelters: { byId: sheltersById },
    gallery: { list: galleryList, facetCounts, relaxationCounts },
    cities: {
      byIds: vi.fn(async () => [
        {
          id: CITY_ID,
          slug: "brovary",
          kind: "city",
          nameScope: "unique_in_ukraine",
          regionId: "814661e1-67de-532e-a38e-2216d8b521ff",
          name: "Бровари",
          regionShort: "Київська обл.",
          raion: "Броварський район",
        },
      ]),
    },
  };
  return {
    client: client as unknown as ShelterPageClient,
    sheltersById,
    galleryList,
    facetCounts,
    relaxationCounts,
  };
}

/** A shelter's facet counts: dogs and cats, enough to show the filters. */
export function makeFacetCounts(overrides: Partial<GalleryFacetCounts> = {}): GalleryFacetCounts {
  return {
    cities: [],
    regions: [],
    ages: { baby: 2, young: 3, adult: 6, senior: 2 },
    sizes: { small: 4, medium: 6, large: 3 },
    sexes: { male: 7, female: 6, unknown: 0 },
    species: { dog: 8, cat: 5 },
    ...overrides,
  };
}
