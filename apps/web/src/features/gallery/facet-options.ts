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
 * Every oblast, always: the list is the 27 regions, not the ones that happen to hold an animal.
 * One with nothing to find shows at zero and is disabled (`isUnavailable`) but stays in its place,
 * ordered like the rest; a chosen one stays clickable so it can be cleared. `labels` names every
 * region (the page passes all 27); `counts` carries the roll-up for those that have animals.
 */
export function regionFacetOptions(
  counts: GalleryFacetCounts,
  labels: Readonly<Record<string, string>>,
  selection: FilterSelection<RegionId>,
): FacetOption<RegionId>[] {
  const countOf = new Map(counts.regions.map((entry) => [entry.regionId as string, entry.count]));
  const ids = new Set<string>([...Object.keys(labels), ...countOf.keys()]);
  if (selection.kind === "oneOf") for (const id of selection.values) ids.add(id);
  return [...ids]
    .map((id) => ({
      value: id as RegionId,
      label: labels[id] ?? id,
      count: countOf.get(id) ?? 0,
    }))
    .sort(byCountThenLabel);
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

/** A city list longer than this is cut to its first dozen (the most animals) behind «Показати всі». */
export const CITY_LIST_COLLAPSED = 12;

/**
 * The cities to draw now. Up to `CITY_LIST_COLLAPSED` options, everything. Past it: the first dozen
 * until the list is expanded; a typed query narrows to the labels containing it, on the whole list.
 * A chosen city is always drawn so it stays clearable (and, in the sheet's form, stays submitted).
 */
export function narrowedCityOptions<T extends string>(
  options: readonly FacetOption<T>[],
  selection: FilterSelection<T>,
  view: { expanded: boolean; query: string },
): readonly FacetOption<T>[] {
  if (options.length <= CITY_LIST_COLLAPSED) return options;
  const query = view.query.trim().toLocaleLowerCase("uk");
  const chosen = (option: FacetOption<T>) => isExplicitlySelected(selection, option.value);
  if (query !== "") {
    return options.filter(
      (option) => option.label.toLocaleLowerCase("uk").includes(query) || chosen(option),
    );
  }
  if (view.expanded) return options;
  return options.filter((option, index) => index < CITY_LIST_COLLAPSED || chosen(option));
}
