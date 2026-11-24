import type {
  CityLabelView,
  GalleryFacetCounts,
  GalleryRelaxation,
  PublicShelterView,
} from "@opika/contracts";
import {
  ANIMAL_SPECIES,
  type AnimalSpecies,
  type CityId,
  FEED_FILTER_DIMENSIONS,
  GALLERY_SORT_LISTS,
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
  /** The species the shelter lists, whatever the filters or page; empty when it lists none. */
  listedSpecies: readonly AnimalSpecies[];
  /** Card city names (a fostered animal's city can differ from the shelter's). */
  cityNames: ReadonlyMap<CityId, string>;
  /** «Тварини в: …»: every city its listed animals are in, the shelter's first; empty when that is the only one. */
  animalCities: readonly string[];
  query: ShelterPageQuery;
  /** All of the shelter's discoverable animals, whatever the filters and the sort: the heading's number. */
  listedTotal: number;
  /** The filter controls' data; null while the shelter has {@link SHELTER_FILTERS_ABOVE} animals or fewer and no filter is on. */
  filterUi: ShelterFilterUi | null;
}

/** Above this many discoverable animals a shelter page offers filters; at or below it, only the sort. */
export const SHELTER_FILTERS_ABOVE = 12;

const ukrainianOrder = new Intl.Collator("uk");

/**
 * The cities a shelter's listed animals are in (§12.2: derived, never entered), the shelter's own
 * city first and the rest in Ukrainian order. Empty when they are all in the shelter's city.
 */
export function animalCitiesOf(
  shelterCityId: CityId,
  labels: readonly CityLabelView[],
): readonly string[] {
  const unique = [...new Map(labels.map((label) => [label.id, label])).values()];
  if (!unique.some((label) => label.id !== shelterCityId)) return [];
  const own = unique.filter((label) => label.id === shelterCityId).map(placeName);
  const others = unique
    .filter((label) => label.id !== shelterCityId)
    .map(placeName)
    .sort(ukrainianOrder.compare);
  return [...own, ...others];
}

export interface ShelterFilterUi {
  /** Per-option counts for the filters and the sort in force, scoped to this shelter. */
  counts: GalleryFacetCounts;
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
    // The shelter's whole count is the freshest sort's, unfiltered: that sort lists every card,
    // while «Зачекались» leaves the stale ones out of the list and its counts.
    const listsEveryCard = GALLERY_SORT_LISTS[query.sort] === "every_card";
    const shelterRead = client.shelters.byId({ shelterId });
    const restRead = Promise.all([
      client.gallery.list({ filters: query.filters, sort: query.sort, page: query.page, scope }),
      filtersOn || !listsEveryCard
        ? client.gallery.facetCounts({ filters: NO_FILTERS, sort: "freshest", scope })
        : null,
      filtersOn
        ? client.gallery.facetCounts({ filters: query.filters, sort: query.sort, scope })
        : null,
    ]);
    // The shelter settles first: its NOT_FOUND (or RATE_LIMITED) must win over a failure of a read
    // started beside it, which would otherwise turn a legitimate 404 into a 500. The rest's own
    // rejection is then handled below, or silenced if the shelter already ended the page.
    restRead.catch(() => undefined);
    const shelter = await shelterRead;
    const [animals, whole, early] = await restRead;
    // Without `whole`, the list is the freshest sort's and unfiltered, so its total is the whole.
    const listedTotal = whole ? whole.species.dog + whole.species.cat : animals.totalMatching;
    // Second wait, all together: the counts the shelter's total calls for, the zero-match
    // suggestions, and the shelter's own city when no card carried it (the cards' cities ride with
    // the list).
    const shelterCityId = shelter.publicLocation.cityId;
    const needsCounts = filtersOn || listedTotal > SHELTER_FILTERS_ABOVE;
    const [counts, relaxed, cityRows] = await Promise.all([
      early ??
        (needsCounts
          ? client.gallery.facetCounts({ filters: query.filters, sort: query.sort, scope })
          : null),
      needsCounts && animals.totalMatching === 0
        ? client.gallery.relaxationCounts({ filters: query.filters, sort: query.sort, scope })
        : null,
      animals.cityLabels.some((city) => city.id === shelterCityId)
        ? null
        : client.cities.byIds({ ids: [shelterCityId] }),
    ]);
    // The shelter's own facts (species, cities) come from the whole; `counts` is the whole only
    // when neither a filter nor the sort narrows the list.
    const all = whole ?? counts;
    let filterUi: ShelterFilterUi | null = null;
    if (counts && all) {
      filterUi = {
        counts,
        hasBothSpecies: all.species.dog > 0 && all.species.cat > 0,
        relaxations: relaxed?.relaxations ?? [],
      };
    }
    // Without either count there are at most 12 animals, no filter and the freshest sort, so page 1
    // holds them all.
    const listedSpecies = ANIMAL_SPECIES.filter((species) =>
      all ? all.species[species] > 0 : animals.items.some((card) => card.species === species),
    );
    const shelterCity =
      animals.cityLabels.find((city) => city.id === shelterCityId) ??
      cityRows?.find((city) => city.id === shelterCityId) ??
      null;
    // With counts, the cities come from the unfiltered scan; without, page 1 holds every animal.
    const listedCityLabels = all
      ? all.cities.filter((city) => city.count > 0).map((city) => city.label)
      : animals.cityLabels;
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
        listedSpecies,
        cityNames,
        animalCities: animalCitiesOf(shelterCityId, listedCityLabels),
        query,
        listedTotal,
        filterUi,
      },
    };
  } catch (error) {
    const refusal = pageRefusalOf(error);
    if (refusal) return { kind: refusal };
    throw error;
  }
}
