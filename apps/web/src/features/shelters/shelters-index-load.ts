import type { CityLabelView, ListedShelterView } from "@opika/contracts";
import type { CityId } from "@opika/domain";
import { placeName } from "@opika/i18n";
import { pageRefusalOf } from "../../api/page-refusal";
import { anonymousRouterClient } from "../../api/server-client";
import { cityPagePath } from "../gallery/filter-url";

type RouterClient = ReturnType<typeof anonymousRouterClient>;

/** The two procedures the shelters list reads; a test passes a stub of just these. */
export type SheltersIndexClient = {
  readonly shelters: Pick<RouterClient["shelters"], "listed">;
  readonly cities: Pick<RouterClient["cities"], "withPages">;
};

/** One city's shelters, under the city's name; the name links to its landing page when one exists. */
export interface ShelterCityGroup {
  readonly cityId: CityId;
  /** As a card names the city («Бровари», or with its oblast where the name repeats); null only if its id does not resolve. */
  readonly cityName: string | null;
  readonly cityHref: string | null;
  readonly shelters: readonly ListedShelterView[];
}

/**
 * `not_found`: no shelter is listed, so the page would be empty (the sitemap leaves it out then
 * too). `rate_limited` is a refusal to answer, never the 404 (RL-F1).
 */
export type SheltersIndexLoad =
  | { kind: "index"; groups: readonly ShelterCityGroup[] }
  | { kind: "not_found" }
  | { kind: "rate_limited" };

export async function loadSheltersIndex(
  client: SheltersIndexClient = anonymousRouterClient(),
): Promise<SheltersIndexLoad> {
  try {
    const [listed, pages] = await Promise.all([
      client.shelters.listed({}),
      client.cities.withPages({}),
    ]);
    if (listed.items.length === 0) return { kind: "not_found" };
    const withPages = new Set(pages.map((page) => page.cityId));
    return { kind: "index", groups: groupByCity(listed.items, listed.cityLabels, withPages) };
  } catch (error) {
    const refusal = pageRefusalOf(error);
    if (refusal) return { kind: refusal };
    throw error;
  }
}

const ukrainianOrder = new Intl.Collator("uk");

/**
 * By the shelter's own city, cities and shelters in Ukrainian alphabetical order (no ranking
 * input: commitment 1); a city whose label is missing goes last.
 */
export function groupByCity(
  items: readonly ListedShelterView[],
  labels: readonly CityLabelView[],
  citiesWithPages: ReadonlySet<CityId>,
): readonly ShelterCityGroup[] {
  const labelById = new Map(labels.map((label) => [label.id, label]));
  const byCity = new Map<CityId, ListedShelterView[]>();
  for (const item of items) {
    const cityId = item.publicLocation.cityId;
    byCity.set(cityId, [...(byCity.get(cityId) ?? []), item]);
  }
  const groups = [...byCity].map(([cityId, shelters]): ShelterCityGroup => {
    const label = labelById.get(cityId);
    return {
      cityId,
      cityName: label ? placeName(label) : null,
      cityHref: label && citiesWithPages.has(cityId) ? cityPagePath(label.slug) : null,
      shelters: [...shelters].sort((a, b) => ukrainianOrder.compare(a.displayName, b.displayName)),
    };
  });
  return groups.sort((a, b) => {
    if (a.cityName === null || b.cityName === null) {
      return Number(a.cityName === null) - Number(b.cityName === null);
    }
    return ukrainianOrder.compare(a.cityName, b.cityName);
  });
}
