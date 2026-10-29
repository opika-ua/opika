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
import { ANIMAL_SPECIES, ANY, DEFAULT_GALLERY_SORT, isExplicitlySelected } from "@opika/domain";
import { ukPublic as uk } from "@opika/i18n/public";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Button, LinkButton } from "../../ui/Button";
import { Chip, choiceClass } from "../../ui/Chip";
import { cx } from "../../ui/cx";
import { Sheet } from "../../ui/Sheet";
import { Text } from "../../ui/Text";
import {
  ageFacetOptions,
  cityFacetOptions,
  type FacetOption,
  facetAccessibleName,
  isUnavailable,
  regionFacetOptions,
  sexFacetOptions,
  sizeFacetOptions,
} from "./facet-options";
import type { CitySlugsById, PlaceIdsBySlug } from "./filter-url";
import {
  GALLERY_PARAM,
  galleryHref,
  parseGalleryQuery,
  resetFiltersHref,
  searchParamsFromFormData,
} from "./filter-url";
import { sheetResultCount, showCountLabel } from "./gallery-copy";

const SHEET_ID = "tvaryny-filters";

interface FilterSheetProps {
  filters: FeedFilters;
  sort: GallerySort;
  /** Slug to id for the form's own submit (`parseGalleryQuery`): the 27 oblasts and the cities on this page. */
  placeIds: PlaceIdsBySlug;
  /** Id to slug for every link and checkbox value, cities and oblasts both. */
  citySlugs: CitySlugsById;
  /** A name for every oblast: the filter always lists all 27. */
  regionLabels: Readonly<Record<string, string>>;
  /** The labels of the cities the URL names, so a chosen city with no animal stays clearable. */
  selectedCities: readonly CityLabelView[];
  /** What a submit right now would show, from the applied filters; a ticked but unsubmitted box does not move it. */
  resultCount: number;
  /** For the sentence «Підходить N тварин у M притулках.» */
  shelterCount: number;
  /** Per-option counts for the applied filters (`gallery.facetCounts`); like `resultCount`, unsubmitted ticks don't move them. */
  counts: GalleryFacetCounts;
}

const SPECIES_LABEL: Record<AnimalSpecies, string> = {
  dog: uk.filters.speciesDogs,
  cat: uk.filters.speciesCats,
};

const LEGEND = "text-label text-ink";

/**
 * One group of choice pills with counts: real checkboxes, so the GET form submits them with no
 * JS (the kit chip lifts the hidden input's focus ring onto the pill). An option with nothing to
 * find is disabled unless ticked, when it must stay clearable.
 */
function FacetGroup<T extends string>({
  legend,
  name,
  options,
  selection,
  submitValue = (value) => value,
  leading,
}: {
  legend: string;
  name: string;
  options: readonly FacetOption<T>[];
  selection: FilterSelection<T>;
  /** The submitted value when it isn't the option's id (a city submits its slug). */
  submitValue?: (value: T) => string;
  leading?: ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className={LEGEND}>{legend}</legend>
      <div className="flex flex-wrap gap-3">
        {leading}
        {options.map((option) => (
          <Chip
            key={option.value}
            kind="choice"
            control="checkbox"
            name={name}
            value={submitValue(option.value)}
            defaultChecked={isExplicitlySelected(selection, option.value)}
            disabled={isUnavailable(option, selection)}
            count={option.count}
            accessibleName={facetAccessibleName(option)}
          >
            {option.label}
          </Chip>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * docs/design/README.md, "03 · Фільтри" + "Rail, count, sort": below 1024px the filters live in a
 * sheet. The kit `Sheet` supplies the trigger, the no-JS `:target` reveal and the native modal
 * `<dialog>` (focus trap, Esc, scroll lock, focus return); this component is its content: a
 * `<form method="GET">` that needs no JS either, because checkboxes and radios sharing a `name`
 * are what a GET turns into the repeated query params `parseGalleryQuery` reads.
 */
export function FilterSheet({
  filters,
  sort,
  placeIds,
  citySlugs,
  regionLabels,
  selectedCities,
  resultCount,
  shelterCount,
  counts,
}: FilterSheetProps) {
  const router = useRouter();

  const slugOf = (id: CityId | RegionId): string => citySlugs.get(id) ?? id;

  // `router.replace`, not the push a real `<a>`/GET produces: ten filter changes should not be ten
  // history entries (same reasoning as `ReplaceNav`). Closing the dialog fires the Sheet's own
  // close handling (scroll lock, focus return, fragment cleanup).
  const navigateWithJs = (from: Element, href: string) => {
    from.closest("dialog")?.close();
    router.replace(href, { scroll: false });
  };

  // «Усі міста» and «Усі області» each drop their own group's constraint and nothing else; they
  // are group chips, not a second «Скинути», so choices made in the other groups survive them.
  const allCitiesHref = galleryHref({ ...filters, cities: ANY }, sort, citySlugs);
  const allRegionsHref = galleryHref({ ...filters, regions: ANY }, sort, citySlugs);

  const onAllCitiesClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    navigateWithJs(event.currentTarget, allCitiesHref);
  };
  const onAllRegionsClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    navigateWithJs(event.currentTarget, allRegionsHref);
  };

  const onResetClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    navigateWithJs(event.currentTarget, resetFiltersHref(sort));
  };

  // The submitted form goes back through the same parser and `galleryHref` the rail's chips use,
  // so the same state reached either way yields the same URL (a default sort is omitted, a group
  // with every value ticked collapses to unconstrained). Without JS the browser submits the form
  // itself and the server reads the same params.
  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitted = parseGalleryQuery(
      searchParamsFromFormData(new FormData(event.currentTarget)),
      placeIds,
    );
    navigateWithJs(event.currentTarget, galleryHref(submitted.filters, submitted.sort, citySlugs));
  };

  return (
    <Sheet
      id={SHEET_ID}
      label={uk.filters.title}
      closeLabel={uk.preview.close}
      hideFrom="desktop"
      trigger={uk.feed.filtersLabel}
      triggerClassName="desktop:hidden rounded-pill border-2 border-ink px-5"
      triggerTestId="filter-sheet-trigger"
      dialogTestId="filter-sheet"
    >
      {/*
        `key` keeps the uncontrolled form honest: React writes a changed `defaultChecked` to the
        attribute only, so after a filter change that did not come from submitting this form
        («Скинути», «Усі міста», the back button) a clicked box would go on showing what was
        last clicked while the URL says otherwise. Keying on the applied state remounts the
        inputs, so what is ticked is always what the address bar says.
      */}
      <form
        key={galleryHref(filters, sort, citySlugs)}
        method="GET"
        action="/tvaryny"
        onSubmit={onSubmit}
        className="flex flex-col gap-7"
      >
        <FacetGroup
          legend={uk.filters.region}
          name={GALLERY_PARAM.region}
          options={regionFacetOptions(counts, regionLabels, filters.regions)}
          selection={filters.regions}
          submitValue={slugOf}
          leading={
            <a
              href={allRegionsHref}
              onClick={onAllRegionsClick}
              className={cx(
                choiceClass(filters.regions.kind === "any" ? "on" : "off"),
                "focus-ring",
              )}
            >
              {uk.filters.allRegions}
            </a>
          }
        />

        <FacetGroup
          legend={uk.filters.city}
          name={GALLERY_PARAM.city}
          options={cityFacetOptions(counts, filters.regions, filters.cities, selectedCities)}
          selection={filters.cities}
          submitValue={slugOf}
          leading={
            <a
              href={allCitiesHref}
              onClick={onAllCitiesClick}
              className={cx(
                choiceClass(filters.cities.kind === "any" ? "on" : "off"),
                "focus-ring",
              )}
            >
              {uk.filters.allCities}
            </a>
          }
        />

        {/*
          Radio, not checkbox: species is an exclusive choice, like the desktop toggle. The «any»
          radio submits `vyd=`, which `parseGalleryQuery` drops as unrecognised, the same «any» an
          absent param gives.
        */}
        <fieldset className="flex flex-col gap-3">
          <legend className={LEGEND}>{uk.filters.species}</legend>
          <div className="flex flex-wrap gap-3">
            <Chip
              kind="choice"
              control="radio"
              name={GALLERY_PARAM.species}
              value=""
              defaultChecked={filters.species.kind === "any"}
            >
              {uk.filters.speciesAny}
            </Chip>
            {ANIMAL_SPECIES.map((species) => (
              <Chip
                key={species}
                kind="choice"
                control="radio"
                name={GALLERY_PARAM.species}
                value={species}
                defaultChecked={isExplicitlySelected(filters.species, species)}
              >
                {SPECIES_LABEL[species]}
              </Chip>
            ))}
          </div>
        </fieldset>

        <FacetGroup
          legend={uk.filters.size}
          name={GALLERY_PARAM.size}
          options={sizeFacetOptions(counts)}
          selection={filters.sizes}
        />

        <FacetGroup
          legend={uk.filters.age}
          name={GALLERY_PARAM.age}
          options={ageFacetOptions(counts)}
          selection={filters.ages}
        />

        {/* Sex is the one survivor of the removed fur/temperament/colour trio (pet card PR 1b). */}
        <FacetGroup
          legend={uk.filters.sex}
          name={GALLERY_PARAM.sex}
          options={sexFacetOptions(counts)}
          selection={filters.sexes}
        />

        <fieldset className="flex flex-col gap-3">
          <legend className={LEGEND}>{uk.filters.sortLabel}</legend>
          <div className="flex flex-wrap gap-3">
            <Chip
              kind="choice"
              control="radio"
              name={GALLERY_PARAM.sort}
              value="freshest"
              defaultChecked={sort === DEFAULT_GALLERY_SORT}
            >
              {uk.filters.sortFreshest}
            </Chip>
            <Chip
              kind="choice"
              control="radio"
              name={GALLERY_PARAM.sort}
              value="longest_waiting"
              defaultChecked={sort === "longest_waiting"}
            >
              {uk.filters.sortLongestWaiting}
            </Chip>
          </div>
        </fieldset>

        <div className="flex flex-col gap-3">
          <Text look="body" className="text-ink-2">
            {sheetResultCount(resultCount, shelterCount, filters.cities.kind !== "any")}
          </Text>
          <div className="flex gap-2">
            <LinkButton
              variant="secondary"
              href={resetFiltersHref(sort)}
              onClick={onResetClick}
              prefetch={false}
            >
              {uk.filters.reset}
            </LinkButton>
            <Button type="submit" className="flex-1">
              {showCountLabel(resultCount)}
            </Button>
          </div>
        </div>
      </form>
    </Sheet>
  );
}
