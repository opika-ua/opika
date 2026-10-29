"use client";

import type { CityLabelView, GalleryFacetCounts } from "@opika/contracts";
import type { AnimalSpecies, FeedFilters, FilterSelection, GallerySort } from "@opika/domain";
import { isExplicitlySelected, relaxDimension } from "@opika/domain";
import { fillTemplate, ukPublic as uk } from "@opika/i18n/public";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { Chip } from "../../ui/Chip";
import { cx } from "../../ui/cx";
import { Popover } from "../../ui/Popover";
import {
  ageFacetOptions,
  cityFacetOptions,
  type FacetOption,
  facetAccessibleName,
  isUnavailable,
  regionFacetOptions,
  selectionSummary,
  sexFacetOptions,
  sizeFacetOptions,
} from "./facet-options";
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
      className="min-w-44 max-w-53 flex-initial"
    >
      {options.map((option) => (
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
      ))}
    </Popover>
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
}: {
  filters: FeedFilters;
  sort: GallerySort;
  citySlugs: CitySlugsById;
  className?: string;
  testIdSuffix?: string;
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
      className={cx(
        "flex h-13 items-stretch gap-1 rounded-field border-2 bg-page px-1",
        active ? "border-accent" : "border-line",
        className,
      )}
    >
      {options.map(({ species, label, testid }) => {
        const segmentActive =
          species === null
            ? filters.species.kind === "any"
            : isExplicitlySelected(filters.species, species);
        const href =
          species === null
            ? galleryHref(relaxDimension(filters, "species"), sort, citySlugs)
            : galleryHref(withOnlySpecies(filters, species), sort, citySlugs);
        return (
          <Link
            key={testid}
            prefetch={false}
            href={href}
            aria-current={segmentActive ? "true" : undefined}
            data-testid={`${testid}${testIdSuffix}`}
            className={cx(
              "flex min-w-11 flex-1 items-center justify-center rounded-field px-3 text-label focus-ring",
              segmentActive ? "bg-ink text-on-ink" : "text-ink-2",
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
}: GalleryFilterDropdownsProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [shown, showOptimistically] = useOptimistic(filters);

  const apply = (next: FeedFilters) =>
    startTransition(() => {
      showOptimistically(next);
      router.replace(galleryHref(next, sort, citySlugs), { scroll: false });
    });
  // An oblast's cities, so deselecting the oblast also drops the cities that narrowed it.
  const regionOfCity = new Map([
    ...counts.cities.map((entry) => [entry.cityId, entry.label.regionId] as const),
    ...selectedCities.map((city) => [city.id, city.regionId] as const),
  ]);
  const clearHref = (dimension: "regions" | "cities" | "ages" | "sizes" | "sexes") =>
    galleryHref(relaxDimension(filters, dimension), sort, citySlugs);

  return (
    <div
      data-testid="gallery-filter-dropdowns"
      // Wraps: five controls at their natural width don't fit the 912px a 1024px window leaves.
      className="hidden min-w-0 flex-1 flex-wrap items-center gap-3 desktop:flex"
    >
      <SpeciesToggle filters={filters} sort={sort} citySlugs={citySlugs} />

      <FacetSelector
        label={uk.filters.region}
        options={regionFacetOptions(counts, regionLabels, shown.regions)}
        selection={shown.regions}
        onToggle={(region) => apply(withToggledRegion(shown, region, regionOfCity))}
        clearHref={clearHref("regions")}
      />
      <FacetSelector
        label={uk.filters.city}
        options={cityFacetOptions(counts, shown.regions, shown.cities, selectedCities)}
        selection={shown.cities}
        onToggle={(city) => apply(withToggledCity(shown, city))}
        clearHref={clearHref("cities")}
      />
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
