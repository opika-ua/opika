import type { GalleryFacetCounts, GalleryRelaxation, PublicShelterView } from "@opika/contracts";
import {
  type CityId,
  FEED_FILTER_DIMENSIONS,
  isConstrained,
  NO_FILTERS,
  ShelterIdSchema,
} from "@opika/domain";
import { placeName, placeText } from "@opika/i18n";
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
  /** The same city as the page's location line prints it («м. Бровари, Київська обл.»; a city that is its own region stays bare). */
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
    // The shelter's NOT_FOUND still decides the page, but the scoped list needs only the id, so it
    // starts with the shelter (a 404 just discards the list). The filter counts that are certain to
    // be used (a filter is in the URL) start with them; the rest waits for the list's total.
    const scope = { kind: "shelter", shelterId } as const;
    // Filters appear above 12 animals, or whenever one is already in the URL (so it can be undone).
    const filtersOn = FEED_FILTER_DIMENSIONS.some((dimension) =>
      isConstrained(query.filters, dimension),
    );
    const shelterRead = client.shelters.byId({ shelterId });
    const restRead = Promise.all([
      client.gallery.list({ filters: query.filters, sort: query.sort, page: query.page, scope }),
      filtersOn
        ? Promise.all([
            client.gallery.facetCounts({ filters: query.filters, scope }),
            client.gallery.facetCounts({ filters: NO_FILTERS, scope }),
          ])
        : null,
    ]);
    // The shelter settles first: its NOT_FOUND (or RATE_LIMITED) must win over a failure of a read
    // started beside it, which would otherwise turn a legitimate 404 into a 500. The rest's own
    // rejection is then handled below, or silenced if the shelter already ended the page.
    restRead.catch(() => undefined);
    const shelter = await shelterRead;
    const [animals, early] = await restRead;
    // Second wait, all together: the counts the list's total calls for, the zero-match suggestions,
    // and the shelter's own city when no card carried it (the cards' cities ride with the list).
    const shelterCityId = shelter.publicLocation.cityId;
    const needsCounts = filtersOn || animals.totalMatching > SHELTER_FILTERS_ABOVE;
    const [counted, relaxed, cityRows] = await Promise.all([
      early ??
        (needsCounts
          ? client.gallery
              .facetCounts({ filters: query.filters, scope })
              .then((c) => [c, c] as const)
          : null),
      needsCounts && animals.totalMatching === 0
        ? client.gallery.relaxationCounts({ filters: query.filters, scope })
        : null,
      animals.cityLabels.some((city) => city.id === shelterCityId)
        ? null
        : client.cities.byIds({ ids: [shelterCityId] }),
    ]);
    let filterUi: ShelterFilterUi | null = null;
    if (counted) {
      const [counts, all] = counted;
      filterUi = {
        counts,
        total: all.species.dog + all.species.cat,
        hasBothSpecies: all.species.dog > 0 && all.species.cat > 0,
        relaxations: relaxed?.relaxations ?? [],
      };
    }
    const shelterCity =
      animals.cityLabels.find((city) => city.id === shelterCityId) ??
      cityRows?.find((city) => city.id === shelterCityId) ??
      null;
    const cityNames = new Map<CityId, string>(
      animals.cityLabels.map((city) => [city.id, placeName(city)]),
    );
    return {
      kind: "shelter",
      view: {
        shelter,
        cityName: shelterCity ? placeName(shelterCity) : null,
        cityPlace: shelterCity ? placeText(shelterCity, "address") : null,
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
