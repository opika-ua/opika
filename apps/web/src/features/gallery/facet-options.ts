import type { GalleryFacetCounts } from "@opika/contracts";
import type { AgeBucket, AnimalSex, CityId, FilterSelection, SizeBucket } from "@opika/domain";
import {
  AGE_BUCKETS,
  ANIMAL_SEXES,
  isExplicitlySelected,
  pluralizeUk,
  SIZE_BUCKETS,
} from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";

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

/** Most animals first, then alphabetically; a city with none still listed, at zero. */
export function cityFacetOptions(
  cities: ReadonlyArray<{ id: CityId; name: string }>,
  counts: GalleryFacetCounts,
): FacetOption<CityId>[] {
  const byCity = new Map(counts.cities.map((entry) => [entry.cityId, entry.count]));
  return cities
    .map((city) => ({ value: city.id, label: city.name, count: byCity.get(city.id) ?? 0 }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "uk"));
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
