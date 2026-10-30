import type {
  CityLabelView,
  GalleryFacetCounts,
  GalleryRelaxation,
  PublicShelterView,
} from "@opika/contracts";
import {
  type CityId,
  FEED_FILTER_DIMENSIONS,
  isConstrained,
  NO_FILTERS,
  ShelterIdSchema,
} from "@opika/domain";
import { fillTemplate, placeName, placeText, uk } from "@opika/i18n";
import { pageRefusalOf } from "../../api/page-refusal";
import { anonymousRouterClient } from "../../api/server-client";
import type { ShelterPageQuery } from "./shelter-url";

/** The procedures the shelter page reads; a test passes a stub of just these. */
export type ShelterPageClient = Pick<
  ReturnType<typeof anonymousRouterClient>,
  "shelters" | "gallery" | "cities"
>;

/** Everything `ShelterPageScreen` is given. */
export interface ShelterPageView {
  shelter: PublicShelterView;
  /** The shelter's city as a title names it (bare, with its oblast where the name repeats); null only if its id does not resolve. */
  cityName: string | null;
  /** The same city as the page's location line prints it («м. Бровари, Київська обл.»; Kyiv and Sevastopol bare). */
  cityPlace: string | null;
  /** One page of the shelter's discoverable animals, in the requested date sort. */
  animals: Awaited<ReturnType<ShelterPageClient["gallery"]["list"]>>;
  /** Card city names (a fostered animal's city can differ from the shelter's). */
  cityNames: ReadonlyMap<CityId, string>;
  query: ShelterPageQuery;
  /** The filter controls' data; null while the shelter has {@link SHELTER_FILTERS_ABOVE} animals or fewer and no filter is on. */
  filterUi: ShelterFilterUi | null;
}

/** Above this many discoverable animals a shelter page offers filters; at or below it, only the sort. */
export const SHELTER_FILTERS_ABOVE = 12;

export interface ShelterFilterUi {
  /** Per-option counts for the filters in force, scoped to this shelter. */
  counts: GalleryFacetCounts;
  /** All of the shelter's discoverable animals, whatever the filters (the heading's number). */
  total: number;
  /** The species switch shows only when both are present. */
  hasBothSpecies: boolean;
  /** Suggestions for a no-match page; empty otherwise. */
  relaxations: readonly GalleryRelaxation[];
}

/** Kyiv and Sevastopol are cities with a region's status: their name already is the region. */
const CITY_REGION_IDS: ReadonlySet<string> = new Set([
  "f421e743-f9dd-5198-86bd-8a05911ec75b",
  "c45a68e7-2bf8-52b5-99ac-b10752d86025",
]);

/**
 * The shelter page's location line: the settlement and its oblast, even for a name that is unique
 * (it is the shelter's address line). A name shared elsewhere already carries its oblast in
 * `placeText`, and Kyiv and Sevastopol have none to add.
 */
export function shelterLocationText(city: CityLabelView): string {
  const place = placeText(city, "full");
  if (city.nameScope !== "unique_in_ukraine" || CITY_REGION_IDS.has(city.regionId)) return place;
  return fillTemplate(uk.place.withRegion, { place, region: city.regionShort });
}

/**
 * What `/prytulky/{id}` can show (designer round 1, S6), the animal page's
 * three outcomes (`animal-page-load.ts`):
 *
 * - `not_found`: `shelters.byId` answers one `NOT_FOUND` for an unknown id
 *   and for a shelter that isn't verified (pending, rejected, suspended,
 *   paused), deliberately not telling them apart; a malformed id is the
 *   same dead end.
 * - `rate_limited` (RL-F1): a refusal to answer is not an answer about the
 *   shelter, so it never shows the not-found page.
 *
 * Any other failure is thrown, to the route's error boundary.
 */
export type ShelterPageLoad =
  | { kind: "shelter"; view: ShelterPageView }
  | { kind: "not_found" }
  | { kind: "rate_limited" };

export async function loadShelterPage(
  rawShelterId: string,
  query: ShelterPageQuery,
  client: ShelterPageClient = anonymousRouterClient(),
): Promise<ShelterPageLoad> {
  const parsedId = ShelterIdSchema.safeParse(rawShelterId);
  if (!parsedId.success) return { kind: "not_found" };
  const shelterId = parsedId.data;

  try {
    // The shelter first: its NOT_FOUND decides the page before any list is
    // read. The scoped list would answer an empty page for the same shelter
    // anyway (S5, DR1-S5-T5), but a 404 must not depend on that.
    const shelter = await client.shelters.byId({ shelterId });
    // The cards' cities ride with the list (`cityLabels`); the shelter's own city is one more id,
    // read by primary key. The settlement list is never read.
    const scope = { kind: "shelter", shelterId } as const;
    const animals = await client.gallery.list({
      filters: query.filters,
      sort: query.sort,
      page: query.page,
      scope,
    });
    // Filters appear above 12 animals, or whenever one is already in the URL (so it can be undone).
    const filtersOn = FEED_FILTER_DIMENSIONS.some((dimension) =>
      isConstrained(query.filters, dimension),
    );
    let filterUi: ShelterFilterUi | null = null;
    if (filtersOn || animals.totalMatching > SHELTER_FILTERS_ABOVE) {
      const counts = await client.gallery.facetCounts({ filters: query.filters, scope });
      const all = filtersOn
        ? await client.gallery.facetCounts({ filters: NO_FILTERS, scope })
        : counts;
      const relaxations =
        animals.totalMatching === 0
          ? (await client.gallery.relaxationCounts({ filters: query.filters, scope })).relaxations
          : [];
      filterUi = {
        counts,
        total: all.species.dog + all.species.cat,
        hasBothSpecies: all.species.dog > 0 && all.species.cat > 0,
        relaxations,
      };
    }
    const shelterCityId = shelter.publicLocation.cityId;
    const shelterCity =
      animals.cityLabels.find((city) => city.id === shelterCityId) ??
      (await client.cities.byIds({ ids: [shelterCityId] })).find(
        (city) => city.id === shelterCityId,
      ) ??
      null;
    const cityNames = new Map<CityId, string>(
      animals.cityLabels.map((city) => [city.id, placeName(city)]),
    );
    return {
      kind: "shelter",
      view: {
        shelter,
        cityName: shelterCity ? placeName(shelterCity) : null,
        cityPlace: shelterCity ? shelterLocationText(shelterCity) : null,
        animals,
        cityNames,
        query,
        filterUi,
      },
    };
  } catch (error) {
    const refusal = pageRefusalOf(error);
    if (refusal) return { kind: refusal };
    throw error;
  }
}
