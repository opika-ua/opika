import type { CityLabelView, GalleryFacetCounts } from "@opika/contracts";
import type { CityId, FilterSelection, RegionId } from "@opika/domain";
import { isExplicitlySelected, pluralizeUk } from "@opika/domain";
import { fillTemplate, placeHint, ukPublic as uk } from "@opika/i18n/public";
import type { MultiSelectRow } from "../../ui/MultiSelectRows";
import { arrangeOptions, type PickerOption, splitAtMatch } from "./filter-search";

/**
 * The Область and Місто lists as the searchable pickers draw them (desktop field and phone
 * checklist), built from the facet counts the page already holds: no request, no new procedure.
 */

const selectedValues = <T extends string>(selection: FilterSelection<T>): readonly T[] =>
  selection.kind === "oneOf" ? selection.values : [];

/** Every oblast, always: one with nothing to find stays listed, at zero, and is not clickable. */
export function regionPickerOptions(
  counts: GalleryFacetCounts,
  labels: Readonly<Record<string, string>>,
  selection: FilterSelection<RegionId>,
): PickerOption[] {
  const countOf = new Map(counts.regions.map((entry) => [entry.regionId as string, entry.count]));
  const ids = new Set<string>([...Object.keys(labels), ...countOf.keys()]);
  for (const id of selectedValues(selection)) ids.add(id);
  return [...ids].map((id) => ({
    value: id,
    label: labels[id] ?? id,
    detail: null,
    count: countOf.get(id) ?? 0,
    selected: isExplicitlySelected(selection, id as RegionId),
  }));
}

/**
 * Only cities that have an animal now, as `cityFacetOptions` has it: once oblasts are chosen only
 * their cities, plus any chosen city so it stays clearable (a stale link's city comes from
 * `selectedCities`, at zero). A shared name carries a hint line (raion and oblast).
 */
export function cityPickerOptions(
  counts: GalleryFacetCounts,
  regions: FilterSelection<RegionId>,
  cities: FilterSelection<CityId>,
  selectedCities: readonly CityLabelView[],
): PickerOption[] {
  const inChosenRegion = (regionId: RegionId): boolean =>
    regions.kind === "any" || regions.values.includes(regionId);
  const options = new Map<string, PickerOption>();
  const add = (label: CityLabelView, id: CityId, count: number) =>
    options.set(id, {
      value: id,
      label: label.name,
      detail: placeHint(label),
      count,
      selected: isExplicitlySelected(cities, id),
    });
  for (const entry of counts.cities) {
    if (!inChosenRegion(entry.label.regionId) && !isExplicitlySelected(cities, entry.cityId)) {
      continue;
    }
    add(entry.label, entry.cityId, entry.count);
  }
  for (const label of selectedCities) {
    if (!options.has(label.id) && isExplicitlySelected(cities, label.id)) add(label, label.id, 0);
  }
  return [...options.values()];
}

/** «Київ, 34 тварини»; a hint joins the name so two same-named places sound different. */
export function pickerOptionName(option: PickerOption): string {
  return fillTemplate(uk.filters.optionCount, {
    option: option.detail === null ? option.label : `${option.label}, ${option.detail}`,
    count: String(option.count),
    animalWord: pluralizeUk(option.count, uk.filters.animalWord),
  });
}

/** The rows a list draws for `query`: filtered, ordered, with the matched part split out. */
export function pickerRows(
  options: readonly PickerOption[],
  view: { query: string; pinned: ReadonlySet<string>; grouped: boolean },
): MultiSelectRow[] {
  return arrangeOptions(options, view).map(({ option, match, group }) => ({
    value: option.value,
    label: splitAtMatch(option.label, match.label),
    detail: option.detail === null ? null : splitAtMatch(option.detail, match.detail),
    count: option.count,
    checked: option.selected,
    // Nothing to find there, so not offered; a chosen one stays clickable so it can be cleared.
    disabled: option.count === 0 && !option.selected,
    name: pickerOptionName(option),
    group:
      group === null
        ? null
        : {
            id: group,
            label: group === "has" ? uk.filters.groupHasAnimals : uk.filters.groupNoAnimals,
          },
  }));
}

/** The chosen names, in the order they were chosen, for the closed field and the sheet's rows. */
export function pickerSummary(options: readonly PickerOption[], values: readonly string[]): string {
  const byValue = new Map(options.map((option) => [option.value, option.label]));
  return values.map((value) => byValue.get(value) ?? value).join(", ");
}
