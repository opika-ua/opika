import type { CityLabelView, GalleryFacetCounts } from "@opika/contracts";
import type { CityId, FeedFilters, FilterSelection, GallerySort, RegionId } from "@opika/domain";
import { fillTemplate, placeName, ukPublic as uk } from "@opika/i18n/public";
import { AGE_LABEL, SEX_LABEL, SIZE_LABEL } from "./facet-options";
import {
  type CitySlugsById,
  galleryHref,
  withToggledAge,
  withToggledCity,
  withToggledRegion,
  withToggledSex,
  withToggledSize,
} from "./filter-url";

/**
 * The filters in force as removable chips (the phone's compact top). The species switch is not a
 * chip: it is always on screen. Each chip's `href` is the same page without that one value, built
 * by the same `withToggled*` the desktop fields use, so a chip and a field reach the same URL.
 */
export type ActiveFilterChip = {
  readonly key: string;
  /** The value's name in the nominative, as the chip prints it. */
  readonly name: string;
  readonly href: string;
  /** «Прибрати фільтр Київська обл.» */
  readonly removeLabel: string;
};

const values = <T extends string>(selection: FilterSelection<T>): readonly T[] =>
  selection.kind === "oneOf" ? selection.values : [];

export function activeFilterCount(filters: FeedFilters): number {
  return (
    values(filters.regions).length +
    values(filters.cities).length +
    values(filters.ages).length +
    values(filters.sizes).length +
    values(filters.sexes).length
  );
}

export function activeFilterChips(input: {
  filters: FeedFilters;
  sort: GallerySort;
  citySlugs: CitySlugsById;
  regionLabels: Readonly<Record<string, string>>;
  selectedCities: readonly CityLabelView[];
  counts: GalleryFacetCounts;
}): ActiveFilterChip[] {
  const { filters, sort, citySlugs, regionLabels, selectedCities, counts } = input;
  const cityLabels = new Map<CityId, CityLabelView>([
    ...counts.cities.map((entry) => [entry.cityId, entry.label] as const),
    ...selectedCities.map((city) => [city.id, city] as const),
  ]);
  const regionOfCity = new Map([...cityLabels].map(([id, label]) => [id, label.regionId] as const));
  const chip = (key: string, name: string, next: FeedFilters): ActiveFilterChip => ({
    key,
    name,
    href: galleryHref(next, sort, citySlugs),
    removeLabel: fillTemplate(uk.filters.removeFilter, { name }),
  });

  return [
    ...values(filters.regions).map((id: RegionId) =>
      chip(`region-${id}`, regionLabels[id] ?? id, withToggledRegion(filters, id, regionOfCity)),
    ),
    ...values(filters.cities).map((id: CityId) => {
      const label = cityLabels.get(id);
      return chip(`city-${id}`, label ? placeName(label) : id, withToggledCity(filters, id));
    }),
    ...values(filters.ages).map((age) =>
      chip(`age-${age}`, AGE_LABEL[age], withToggledAge(filters, age)),
    ),
    ...values(filters.sizes).map((size) =>
      chip(`size-${size}`, SIZE_LABEL[size], withToggledSize(filters, size)),
    ),
    ...values(filters.sexes).map((sex) =>
      chip(`sex-${sex}`, SEX_LABEL[sex], withToggledSex(filters, sex)),
    ),
  ];
}
