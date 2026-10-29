import type { CityLabelView, RegionView } from "@opika/contracts";
import type { CityId, RegionId } from "@opika/domain";
import type { CityTokenResolution } from "./city-tokens";
import type { CitySlugsById, PlaceIdsBySlug } from "./filter-url";

/**
 * Everything a gallery-shaped page knows about places, built from what it actually holds: the 27
 * oblasts (a constant), the cities its URL names (resolved by token), and the cities its response
 * mentions (the page's cards, the cities that have an animal). Never from a settlement list:
 * nothing here grows with the ~30k rows in `cities`, only with the cities that have animals.
 */
export type PlaceBook = {
  /** Slug to id, for the URL parser and the filter form. Tokens that resolved are included. */
  readonly placeIds: PlaceIdsBySlug;
  /** Id to slug, cities and oblasts both, for every link the page writes. */
  readonly slugs: CitySlugsById;
  readonly cities: ReadonlyMap<CityId, CityLabelView>;
  readonly regions: ReadonlyMap<RegionId, RegionView>;
  readonly regionOfCity: ReadonlyMap<CityId, RegionId>;
};

export function placeBookOf(
  regions: readonly RegionView[],
  cityLabels: Iterable<CityLabelView> = [],
  resolutions: readonly CityTokenResolution[] = [],
): PlaceBook {
  const cities = new Map<CityId, CityLabelView>();
  for (const label of cityLabels) cities.set(label.id, label);
  for (const { city } of resolutions) if (city) cities.set(city.id, city);

  const citiesBySlug = new Map<string, CityId>();
  for (const label of cities.values()) citiesBySlug.set(label.slug, label.id);
  // A former slug or a legacy id the URL used: it parses to the same city as the current slug.
  for (const { token, city } of resolutions) if (city) citiesBySlug.set(token, city.id);

  const slugs = new Map<CityId | RegionId, string>();
  for (const region of regions) slugs.set(region.id, region.slug);
  for (const label of cities.values()) slugs.set(label.id, label.slug);

  return {
    placeIds: {
      cities: citiesBySlug,
      regions: new Map(regions.map((region) => [region.slug, region.id])),
    },
    slugs,
    cities,
    regions: new Map(regions.map((region) => [region.id, region])),
    regionOfCity: new Map([...cities.values()].map((label) => [label.id, label.regionId])),
  };
}
