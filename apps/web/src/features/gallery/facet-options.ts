import type { CityLabelView, GalleryFacetCounts } from "@opika/contracts";
import type {
  AgeBucket,
  AnimalSex,
  CityId,
  FilterSelection,
  RegionId,
  SizeBucket,
} from "@opika/domain";
import {
  AGE_BUCKETS,
  ANIMAL_SEXES,
  isExplicitlySelected,
  pluralizeUk,
  SIZE_BUCKETS,
} from "@opika/domain";
import { fillTemplate, placeName, ukPublic as uk } from "@opika/i18n/public";

/**
 * One option of a filter selector (desktop popup) or sheet group (mobile), shared by both so the
 * two can't order, count or name an option differently.
 */
export type FacetOption<T extends string> = {
  readonly value: T;
  readonly label: string;
  readonly count: number;
};

export const AGE_LABEL: Record<AgeBucket, string> = {
  baby: uk.filters.ageBaby,
  young: uk.filters.ageYoung,
  adult: uk.filters.ageAdult,
  senior: uk.filters.ageSenior,
};
export const SIZE_LABEL: Record<SizeBucket, string> = {
  small: uk.filters.sizeSmall,
  medium: uk.filters.sizeMedium,
  large: uk.filters.sizeLarge,
};
export const SEX_LABEL: Record<AnimalSex, string> = {
  male: uk.filters.sexMale,
  female: uk.filters.sexFemale,
  unknown: uk.filters.sexUnknown,
};

const byCountThenLabel = <T extends string>(a: FacetOption<T>, b: FacetOption<T>): number =>
  b.count - a.count || a.label.localeCompare(b.label, "uk");

/**
 * The city options are exactly the cities that have an animal (`counts.cities`, derived from the
 * animals on the server), never the settlement list. Once oblasts are chosen only their cities
 * are offered, plus any city that is itself chosen so it stays clearable. A chosen city with no
 * animal at all (a stale link) comes from `selectedCities`, the labels the page resolved from the
 * URL, at zero. A name shared by several settlements carries its oblast (`placeName`).
 */
export function cityFacetOptions(
  counts: GalleryFacetCounts,
  regions: FilterSelection<RegionId>,
  cities: FilterSelection<CityId>,
  selectedCities: readonly CityLabelView[] = [],
): FacetOption<CityId>[] {
  const inChosenRegion = (regionId: RegionId): boolean =>
    regions.kind === "any" || regions.values.includes(regionId);

  const options = new Map<CityId, FacetOption<CityId>>();
  for (const entry of counts.cities) {
    if (!inChosenRegion(entry.label.regionId) && !isExplicitlySelected(cities, entry.cityId)) {
      continue;
    }
    options.set(entry.cityId, {
      value: entry.cityId,
      label: placeName(entry.label),
      count: entry.count,
    });
  }
  for (const label of selectedCities) {
    if (!options.has(label.id) && isExplicitlySelected(cities, label.id)) {
      options.set(label.id, { value: label.id, label: placeName(label), count: 0 });
    }
  }
  return [...options.values()].sort(byCountThenLabel);
}

/**
 * The oblasts that have an animal, with the roll-up count, plus any chosen oblast with none so it
 * stays clearable. `labels` holds a name for every oblast the page may print (the ones in the
 * counts and the ones in the URL), so the 27-row list is never shipped whole.
 */
export function regionFacetOptions(
  counts: GalleryFacetCounts,
  labels: Readonly<Record<string, string>>,
  selection: FilterSelection<RegionId>,
): FacetOption<RegionId>[] {
  const options = new Map<RegionId, FacetOption<RegionId>>();
  for (const entry of counts.regions) {
    options.set(entry.regionId, {
      value: entry.regionId,
      label: labels[entry.regionId] ?? entry.regionId,
      count: entry.count,
    });
  }
  if (selection.kind === "oneOf") {
    for (const id of selection.values) {
      if (!options.has(id)) options.set(id, { value: id, label: labels[id] ?? id, count: 0 });
    }
  }
  return [...options.values()].sort(byCountThenLabel);
}

/** The closed dimensions keep their natural order: young to old, small to large. */
export const ageFacetOptions = (counts: GalleryFacetCounts): FacetOption<AgeBucket>[] =>
  AGE_BUCKETS.map((age) => ({ value: age, label: AGE_LABEL[age], count: counts.ages[age] }));

export const sizeFacetOptions = (counts: GalleryFacetCounts): FacetOption<SizeBucket>[] =>
  SIZE_BUCKETS.map((size) => ({ value: size, label: SIZE_LABEL[size], count: counts.sizes[size] }));

export const sexFacetOptions = (counts: GalleryFacetCounts): FacetOption<AnimalSex>[] =>
  ANIMAL_SEXES.map((sex) => ({ value: sex, label: SEX_LABEL[sex], count: counts.sexes[sex] }));

/** «Київ, 34 тварини»: the count is part of the name, not a stray number after it. */
export const facetAccessibleName = (option: FacetOption<string>): string =>
  fillTemplate(uk.filters.optionCount, {
    option: option.label,
    count: String(option.count),
    animalWord: pluralizeUk(option.count, uk.filters.animalWord),
  });

/** Nothing to find there, so not offered - unless it's chosen, and must stay clearable. */
export const isUnavailable = <T extends string>(
  option: FacetOption<T>,
  selection: FilterSelection<T>,
): boolean => option.count === 0 && !isExplicitlySelected(selection, option.value);

/** The selected options' labels in the panel's own order, or the dimension's name. */
export function selectionSummary<T extends string>(
  options: readonly FacetOption<T>[],
  selection: FilterSelection<T>,
  dimensionLabel: string,
): string {
  const chosen = options.filter((option) => isExplicitlySelected(selection, option.value));
  return chosen.length > 0 ? chosen.map((option) => option.label).join(", ") : dimensionLabel;
}
