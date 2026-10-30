"use client";

import type { CityLabelView, GalleryFacetCounts } from "@opika/contracts";
import type {
  AnimalSpecies,
  CityId,
  FeedFilters,
  FilterSelection,
  GallerySort,
  RegionId,
} from "@opika/domain";
import { isExplicitlySelected, relaxDimension } from "@opika/domain";
import { fillTemplate, ukPublic as uk } from "@opika/i18n/public";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { Chip } from "../../ui/Chip";
import { ComboboxMulti } from "../../ui/ComboboxMulti";
import { cx } from "../../ui/cx";
import { SEGMENT, SEGMENT_HIT, SEGMENT_OFF, SEGMENT_ON, SEGMENT_TRACK } from "../../ui/form";
import { Popover } from "../../ui/Popover";
import {
  ageFacetOptions,
  type FacetOption,
  facetAccessibleName,
  isUnavailable,
  selectionSummary,
  sexFacetOptions,
  sizeFacetOptions,
} from "./facet-options";
import type { PickerOption } from "./filter-search";
import type { CitySlugsById } from "./filter-url";
import {
  galleryHref,
  withOnlySpecies,
  withToggledAge,
  withToggledCity,
  withToggledRegion,
  withToggledSex,
  withToggledSize,
} from "./filter-url";
import { cityPickerOptions, pickerRows, pickerSummary, regionPickerOptions } from "./picker-model";

interface GalleryFilterDropdownsProps {
  filters: FeedFilters;
  sort: GallerySort;
  citySlugs: CitySlugsById;
  /** A name for every oblast: the filter always lists all 27. */
  regionLabels: Readonly<Record<string, string>>;
  /** The labels of the cities the URL names, so a chosen city with no animal stays clearable. */
  selectedCities: readonly CityLabelView[];
  /** Per-option counts, the selector's own choice ignored (`gallery.facetCounts`). */
  counts: GalleryFacetCounts;
  /** A shelter page: its own path for every link, and no Область/Місто fields (one shelter has one place). */
  scope?: { basePath: string; showSpecies: boolean };
}

const SPECIES_LABEL: Record<AnimalSpecies, string> = {
  dog: uk.filters.speciesDogs,
  cat: uk.filters.speciesCats,
};

/**
 * One filter selector (handoff `88:1906`): a field-shaped trigger naming the chosen options, and
 * a panel of pills with counts. A pill applies at once (the URL is the state) and the panel stays
 * open for the next one; there is no Apply button. The ✕ that clears the whole dimension in one
 * click stays, as Oleksii asked for on the dropdown it replaces.
 */
function FacetSelector<T extends string>({
  label,
  options,
  selection,
  onToggle,
  clearHref,
}: {
  label: string;
  options: readonly FacetOption<T>[];
  selection: FilterSelection<T>;
  onToggle: (value: T) => void;
  clearHref: string;
}) {
  const summary = selectionSummary(options, selection, label);
  const pill = (option: FacetOption<T>) => (
    <Chip
      key={option.value}
      kind="choice"
      control="button"
      pressed={isExplicitlySelected(selection, option.value)}
      disabled={isUnavailable(option, selection)}
      count={option.count}
      accessibleName={facetAccessibleName(option)}
      onPress={() => onToggle(option.value)}
    >
      {option.label}
    </Chip>
  );
  return (
    <Popover
      variant="field"
      panel="pills"
      // The visible summary ends the name, so voice control can say what it sees (WCAG 2.5.3).
      label={`${label}: ${summary}`}
      panelLabel={label}
      active={selection.kind !== "any"}
      trigger={summary}
      clear={{
        href: clearHref,
        label: fillTemplate(uk.filters.clearDimension, { dimension: label }),
      }}
      className="min-w-36 max-w-40 flex-initial"
    >
      {options.map(pill)}
    </Popover>
  );
}

/**
 * Область and Місто (filters v2): a searchable multi-select field over the loaded options, applied
 * at once like the pills it replaces. Only the city list has no empty rows to show; the oblast list
 * always lists all 27 in two groups.
 */
function SearchField({
  id,
  label,
  searchLabel,
  options,
  values,
  grouped,
  noMatchHint,
  onToggle,
  onClear,
}: {
  id: string;
  label: string;
  searchLabel: string;
  options: readonly PickerOption[];
  values: readonly string[];
  grouped: boolean;
  noMatchHint?: string;
  onToggle: (value: string) => void;
  onClear: () => void;
}) {
  return (
    <ComboboxMulti
      id={id}
      label={label}
      summary={pickerSummary(options, values)}
      selectedValues={values}
      rows={(query, pinned) => pickerRows(options, { query, pinned, grouped })}
      onToggle={onToggle}
      onClear={onClear}
      messages={{
        search: searchLabel,
        clear: uk.filters.clearSelection,
        selectedCount: (count) => fillTemplate(uk.filters.selectedCount, { count: String(count) }),
        found: (count) => fillTemplate(uk.filters.cityFound, { count: String(count) }),
        noMatch: uk.filters.cityNoMatch,
        noMatchHint,
        clearField: fillTemplate(uk.filters.clearDimension, { dimension: label }),
      }}
      className="min-w-40 max-w-52 flex-initial"
    />
  );
}

/**
 * The species filter's own control (gallery filter restructure; restyled
 * again per the owner's option-B sketch, `filter-row-option-B.png`). A
 * three-way segmented toggle - «Усі» / «Собаки» / «Коти» - exclusive
 * choice, not the dropdown's multi-select, so `withOnlySpecies`
 * (`filter-url.ts`) writes the next href rather than toggle-add/remove.
 *
 * Field-shaped, like the selectors' triggers: accent border once anything
 * but «Усі» is picked; the selected segment fills ink.
 *
 * Rendered twice on the real page now (`tvaryny/page.tsx`): once here,
 * first in the desktop filter row (`className` defaults to `shrink-0`),
 * and once standalone in the new mobile-only row above «Фільтр»/sort
 * (`className="w-full"`, `testIdSuffix="-mobile"` so the two DOM copies -
 * one hidden by CSS at any given width, same pattern every other
 * responsive pair in this codebase already uses - don't collide on
 * `data-testid`). `flex-1` on each segment only visibly stretches them
 * when the container itself has a forced width (the mobile `w-full`
 * copy); the desktop copy's auto-width container has no leftover space to
 * distribute, so it still shrinks to content.
 */
export function SpeciesToggle({
  filters,
  sort,
  citySlugs,
  className = "shrink-0",
  testIdSuffix = "",
  basePath,
}: {
  filters: FeedFilters;
  sort: GallerySort;
  citySlugs: CitySlugsById;
  className?: string;
  testIdSuffix?: string;
  basePath?: string | undefined;
}) {
  const active = filters.species.kind !== "any";
  const options: ReadonlyArray<{
    species: AnimalSpecies | null;
    label: string;
    testid: string;
  }> = [
    { species: null, label: uk.filters.speciesAny, testid: "species-any" },
    { species: "dog", label: SPECIES_LABEL.dog, testid: "species-dog" },
    { species: "cat", label: SPECIES_LABEL.cat, testid: "species-cat" },
  ];

  return (
    // biome-ignore lint/a11y/useSemanticElements: a <fieldset> does not stretch its flex children to its own height.
    <div
      role="group"
      aria-label={uk.filters.species}
      data-testid={`species-toggle${testIdSuffix}`}
      className={cx(SEGMENT_TRACK, active ? "border-accent" : "border-line", className)}
    >
      {options.map(({ species, label, testid }) => {
        const segmentActive =
          species === null
            ? filters.species.kind === "any"
            : isExplicitlySelected(filters.species, species);
        const href =
          species === null
            ? galleryHref(relaxDimension(filters, "species"), sort, citySlugs, basePath)
            : galleryHref(withOnlySpecies(filters, species), sort, citySlugs, basePath);
        return (
          <Link
            key={testid}
            prefetch={false}
            href={href}
            aria-current={segmentActive ? "true" : undefined}
            data-testid={`${testid}${testIdSuffix}`}
            className={cx(
              SEGMENT,
              SEGMENT_HIT,
              "focus-ring",
              segmentActive ? SEGMENT_ON : SEGMENT_OFF,
            )}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}

/**
 * The desktop filter row, in the option-B order: species first, then the four selectors (city,
 * age, size, sex). Hidden below `desktop:`, where `FilterSheet` carries the same groups.
 *
 * Toggles go through `useOptimistic`: the pill and the trigger show the new state at once, and a
 * second tap before the page has re-rendered builds on the first instead of undoing it.
 */
export function GalleryFilterDropdowns({
  filters,
  sort,
  citySlugs,
  regionLabels,
  selectedCities,
  counts,
  scope,
}: GalleryFilterDropdownsProps) {
  const basePath = scope?.basePath;
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [shown, showOptimistically] = useOptimistic(filters);

  const apply = (next: FeedFilters) =>
    startTransition(() => {
      showOptimistically(next);
      router.replace(galleryHref(next, sort, citySlugs, basePath), { scroll: false });
    });
  // An oblast's cities, so deselecting the oblast also drops the cities that narrowed it.
  const regionOfCity = new Map([
    ...counts.cities.map((entry) => [entry.cityId, entry.label.regionId] as const),
    ...selectedCities.map((city) => [city.id, city.regionId] as const),
  ]);
  const clearHref = (dimension: "regions" | "cities" | "ages" | "sizes" | "sexes") =>
    galleryHref(relaxDimension(filters, dimension), sort, citySlugs, basePath);

  return (
    <div
      data-testid="gallery-filter-dropdowns"
      // Wraps: five controls at their natural width don't fit the 912px a 1024px window leaves.
      className="hidden min-w-0 flex-1 flex-wrap items-center gap-2 desktop:flex"
    >
      {(scope === undefined || scope.showSpecies) && (
        <SpeciesToggle filters={filters} sort={sort} citySlugs={citySlugs} basePath={basePath} />
      )}

      {scope === undefined && (
        <>
      <SearchField
        id="gallery-region-field"
        label={uk.filters.region}
        searchLabel={uk.filters.findRegionField}
        options={regionPickerOptions(counts, regionLabels, shown.regions)}
        values={shown.regions.kind === "oneOf" ? shown.regions.values : []}
        grouped
        onToggle={(region) => apply(withToggledRegion(shown, region as RegionId, regionOfCity))}
        onClear={() => apply(relaxDimension(shown, "regions"))}
      />
      <SearchField
        id="gallery-city-field"
        label={uk.filters.city}
        searchLabel={uk.filters.findCityField}
        options={cityPickerOptions(counts, shown.regions, shown.cities, selectedCities)}
        values={shown.cities.kind === "oneOf" ? shown.cities.values : []}
        grouped={false}
        noMatchHint={uk.filters.cityNoMatchHint}
        onToggle={(city) => apply(withToggledCity(shown, city as CityId))}
        onClear={() => apply(relaxDimension(shown, "cities"))}
      />
        </>
      )}
      <FacetSelector
        label={uk.filters.age}
        options={ageFacetOptions(counts)}
        selection={shown.ages}
        onToggle={(age) => apply(withToggledAge(shown, age))}
        clearHref={clearHref("ages")}
      />
      <FacetSelector
        label={uk.filters.size}
        options={sizeFacetOptions(counts)}
        selection={shown.sizes}
        onToggle={(size) => apply(withToggledSize(shown, size))}
        clearHref={clearHref("sizes")}
      />
      <FacetSelector
        label={uk.filters.sex}
        options={sexFacetOptions(counts)}
        selection={shown.sexes}
        onToggle={(sex) => apply(withToggledSex(shown, sex))}
        clearHref={clearHref("sexes")}
      />
    </div>
  );
}
