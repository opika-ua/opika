"use client";

import type { CityLabelView, GalleryFacetCounts } from "@opika/contracts";
import type { CityId, FeedFilters, FilterSelection, GallerySort, RegionId } from "@opika/domain";
import { ANIMAL_SPECIES, ANY, isExplicitlySelected } from "@opika/domain";
import { fillTemplate, ukPublic as uk } from "@opika/i18n/public";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button, LinkButton } from "../../ui/Button";
import { Chip, choiceClass } from "../../ui/Chip";
import { cx } from "../../ui/cx";
import { Icon } from "../../ui/Icon";
import { MultiSelectChecklist } from "../../ui/MultiSelectRows";
import { Sheet } from "../../ui/Sheet";
import { activeFilterCount } from "./active-filters";
import { CityFacetChoices } from "./CityFacetChoices";
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
  withToggledCity,
  withToggledRegion,
} from "./filter-url";
import { showAnimalsLabel } from "./gallery-copy";
import { liveResultCount } from "./live-count";
import { cityPickerOptions, pickerRows, pickerSummary, regionPickerOptions } from "./picker-model";

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
  /**
   * What «Показати …» shows, from the applied filters: a count for choices not yet applied would
   * need a request per tick, which this sheet does not make.
   */
  resultCount: number;
  /** Per-option counts for the applied filters (`gallery.facetCounts`). */
  counts: GalleryFacetCounts;
}

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
  windowed,
}: {
  legend: string;
  name: string;
  options: readonly FacetOption<T>[];
  selection: FilterSelection<T>;
  /** The submitted value when it isn't the option's id (a city submits its slug). */
  submitValue?: (value: T) => string;
  leading?: ReactNode;
  /** The city group: windows a long list (first dozen, show all, local filter) instead of drawing every option. */
  windowed?: { idPrefix: string };
}) {
  const chip = (option: FacetOption<T>) => (
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
  );
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className={LEGEND}>{legend}</legend>
      <div className="flex flex-wrap gap-3">
        {leading}
        {windowed ? (
          <CityFacetChoices
            idPrefix={windowed.idPrefix}
            options={options}
            selection={selection}
            renderOption={chip}
          />
        ) : (
          options.map(chip)
        )}
      </div>
    </fieldset>
  );
}

type View = "main" | "region" | "city";

/** A row of the sheet that opens a drill-down: the label, the current choice (or «Усі») and «›». */
function DrillRow({
  label,
  summary,
  onOpen,
}: {
  label: string;
  summary: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      // The visible choice ends the name, so voice control can say what it sees (WCAG 2.5.3).
      aria-label={`${label}, ${summary}`}
      className="flex min-h-target w-full cursor-pointer items-center justify-between gap-3 text-left text-body text-ink focus-ring"
    >
      <span className="text-label">{label}</span>
      <span className="flex min-w-0 items-center gap-1 text-ink-2">
        <span className="truncate text-body">{summary}</span>
        <Icon name="chevron-right" size="md" />
      </span>
    </button>
  );
}

/**
 * Below 1024px the filters live in one dialog (`docs/design/README.md`, "03 · Фільтри", as reshaped
 * by filters v2): full-screen on a phone, a centred dialog on a tablet. The kit `Sheet` supplies the
 * trigger, the no-JS `:target` reveal and the native modal `<dialog>` (focus trap, Esc, scroll lock,
 * focus return). The content is a `<form method="GET">`: nothing is applied until «Показати …»
 * (the desktop fields apply at once), and ✕ discards the edits.
 *
 * With JS, Область and Місто are rows that open a full-screen checklist with a search field (a
 * drill-down inside the same dialog); their choices live in `draft` and are submitted as hidden
 * inputs. Without JS the drill-downs cannot open, so the server-rendered form falls back to the
 * pill groups for those two, and the browser submits the same params either way.
 */
export function FilterSheet({
  filters,
  sort,
  placeIds,
  citySlugs,
  regionLabels,
  selectedCities,
  resultCount,
  counts,
}: FilterSheetProps) {
  const router = useRouter();
  const [js, setJs] = useState(false);
  useEffect(() => setJs(true), []);
  const [view, setView] = useState<View>("main");
  const [draft, setDraft] = useState<FeedFilters>(filters);
  const [pinned, setPinned] = useState<ReadonlySet<string>>(() => new Set());
  const [query, setQuery] = useState("");
  // Bumped when the dialog closes, so the uncontrolled pill checkboxes forget unsaved ticks.
  const [discards, setDiscards] = useState(0);
  // The pill groups' ticks, read from the form on every change (they are uncontrolled inputs).
  const [ticked, setTicked] = useState<FeedFilters | null>(null);

  // A change that did not come from this form (a chip's ✕, the desktop fields) is the new baseline.
  useEffect(() => {
    setDraft(filters);
    setTicked(null);
  }, [filters]);

  // Escape inside a drill-down steps back to the sheet's main screen; Escape there closes the sheet.
  const viewRef = useRef<View>("main");
  viewRef.current = view;
  useEffect(() => {
    const dialog = document.getElementById(SHEET_ID);
    if (!dialog) return;
    const onCancel = (event: Event) => {
      if (viewRef.current === "main") return;
      event.preventDefault();
      setView("main");
    };
    dialog.addEventListener("cancel", onCancel);
    return () => dialog.removeEventListener("cancel", onCancel);
  }, []);

  const appliedKey = galleryHref(filters, sort, citySlugs);
  const slugOf = (id: CityId | RegionId): string => citySlugs.get(id) ?? id;

  // `router.replace`, not the push a real `<a>`/GET produces: ten filter changes should not be ten
  // history entries (same reasoning as `ReplaceNav`). Closing the dialog fires the Sheet's own
  // close handling (scroll lock, focus return, fragment cleanup).
  const navigateWithJs = (from: Element, href: string) => {
    from.closest("dialog")?.close();
    router.replace(href, { scroll: false });
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

  const regionOfCity = new Map<CityId, RegionId>([
    ...counts.cities.map((entry) => [entry.cityId, entry.label.regionId] as const),
    ...selectedCities.map((city) => [city.id, city.regionId] as const),
  ]);
  const regionOptions = regionPickerOptions(counts, regionLabels, draft.regions);
  const cityOptions = cityPickerOptions(counts, draft.regions, draft.cities, selectedCities);
  const regionValues = draft.regions.kind === "oneOf" ? draft.regions.values : [];
  const cityValues = draft.cities.kind === "oneOf" ? draft.cities.values : [];
  const anySummary = (options: typeof regionOptions, values: readonly string[]) =>
    values.length === 0 ? uk.filters.anyValue : pickerSummary(options, values);

  const openView = (next: Exclude<View, "main">) => {
    setPinned(new Set<string>(next === "region" ? regionValues : cityValues));
    setQuery("");
    setView(next);
  };

  const live: FeedFilters = {
    ...(ticked ?? filters),
    regions: draft.regions,
    cities: draft.cities,
  };
  const shownCount = js ? liveResultCount(filters, live, counts, resultCount) : resultCount;
  const activeCount = activeFilterCount(filters);
  const species = ANIMAL_SPECIES.find((value) => isExplicitlySelected(filters.species, value));

  const form = (close: ReactNode) => (
    <form
      key={`${appliedKey}-${discards}`}
      method="GET"
      action="/tvaryny"
      onSubmit={onSubmit}
      onChange={(event) =>
        setTicked(
          parseGalleryQuery(searchParamsFromFormData(new FormData(event.currentTarget)), placeIds)
            .filters,
        )
      }
      className="flex min-h-0 flex-1 flex-col"
    >
      {/* Species and sort have their own controls on the page; a GET submit must carry them along. */}
      <input type="hidden" name={GALLERY_PARAM.species} value={species ?? ""} />
      <input type="hidden" name={GALLERY_PARAM.sort} value={sort} />
      {js
        ? [
            ...regionValues.map((id) => (
              <input key={`r-${id}`} type="hidden" name={GALLERY_PARAM.region} value={slugOf(id)} />
            )),
            ...cityValues.map((id) => (
              <input key={`c-${id}`} type="hidden" name={GALLERY_PARAM.city} value={slugOf(id)} />
            )),
          ]
        : null}

      <div className={cx("min-h-0 flex-1 flex-col", view === "main" ? "flex" : "hidden")}>
        <div className="flex items-center justify-between gap-4 px-5 pt-3 pb-2">
          <h2 className="text-title text-ink">{uk.filters.title}</h2>
          {close}
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto px-5 pb-6">
          {js ? (
            <div className="flex flex-col divide-y-2 divide-line">
              <DrillRow
                label={uk.filters.region}
                summary={anySummary(regionOptions, regionValues)}
                onOpen={() => openView("region")}
              />
              <DrillRow
                label={uk.filters.city}
                summary={anySummary(cityOptions, cityValues)}
                onOpen={() => openView("city")}
              />
            </div>
          ) : (
            <>
              <FacetGroup
                legend={uk.filters.region}
                name={GALLERY_PARAM.region}
                options={regionFacetOptions(counts, regionLabels, filters.regions)}
                selection={filters.regions}
                submitValue={slugOf}
                leading={
                  <a
                    href={galleryHref({ ...filters, regions: ANY }, sort, citySlugs)}
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
                windowed={{ idPrefix: "sheet" }}
                leading={
                  <a
                    href={galleryHref({ ...filters, cities: ANY }, sort, citySlugs)}
                    className={cx(
                      choiceClass(filters.cities.kind === "any" ? "on" : "off"),
                      "focus-ring",
                    )}
                  >
                    {uk.filters.allCities}
                  </a>
                }
              />
            </>
          )}

          <FacetGroup
            legend={uk.filters.age}
            name={GALLERY_PARAM.age}
            options={ageFacetOptions(counts)}
            selection={filters.ages}
          />
          <FacetGroup
            legend={uk.filters.size}
            name={GALLERY_PARAM.size}
            options={sizeFacetOptions(counts)}
            selection={filters.sizes}
          />
          <FacetGroup
            legend={uk.filters.sex}
            name={GALLERY_PARAM.sex}
            options={sexFacetOptions(counts)}
            selection={filters.sexes}
          />
        </div>
        <div className="flex gap-2 border-t-2 border-line px-5 pt-3 pb-safe">
          <LinkButton
            variant="secondary"
            href={resetFiltersHref(sort)}
            onClick={onResetClick}
            prefetch={false}
          >
            {uk.filters.reset}
          </LinkButton>
          <Button type="submit" className="flex-1">
            {shownCount === null ? uk.filters.showResults : showAnimalsLabel(shownCount)}
          </Button>
        </div>
      </div>

      {js && view !== "main" ? (
        <DrillDown
          title={view === "region" ? uk.filters.region : uk.filters.city}
          searchLabel={view === "region" ? uk.filters.findRegionField : uk.filters.findCityField}
          query={query}
          onQuery={setQuery}
          options={view === "region" ? regionOptions : cityOptions}
          pinned={pinned}
          grouped={view === "region"}
          noMatchHint={view === "city" ? uk.filters.cityNoMatchHint : undefined}
          onToggle={(value) =>
            setDraft((current) =>
              view === "region"
                ? withToggledRegion(current, value as RegionId, regionOfCity)
                : withToggledCity(current, value as CityId),
            )
          }
          onClear={() =>
            setDraft((current) =>
              view === "region"
                ? { ...current, regions: ANY, cities: ANY }
                : { ...current, cities: ANY },
            )
          }
          onBack={() => setView("main")}
          close={close}
        />
      ) : null}
    </form>
  );

  return (
    <Sheet
      id={SHEET_ID}
      label={uk.filters.title}
      triggerLabel={
        activeCount > 0
          ? `${uk.filters.title}, ${fillTemplate(uk.filters.activeCount, { count: String(activeCount) })}`
          : uk.filters.title
      }
      closeLabel={uk.filters.close}
      hideFrom="desktop"
      presentation="screen"
      onClosed={() => {
        setView("main");
        setQuery("");
        setDraft(filters);
        setTicked(null);
        setDiscards((count) => count + 1);
      }}
      trigger={
        <>
          {uk.filters.title}
          {activeCount > 0 ? (
            <span
              aria-hidden="true"
              className="inline-flex size-6 items-center justify-center rounded-pill bg-accent text-caption text-on-ink"
            >
              {activeCount}
            </span>
          ) : null}
        </>
      }
      triggerClassName="desktop:hidden shrink-0 rounded-pill border-2 border-ink px-4 tablet:px-5"
      triggerTestId="filter-sheet-trigger"
      dialogTestId="filter-sheet"
    >
      {({ close }) => form(close)}
    </Sheet>
  );
}

/**
 * The Область / Місто screen: «‹», the title and ✕; the search field pinned under it (not focused
 * on open, so the on-screen keyboard does not jump up); the checklist; «Очистити» and «Готово»
 * pinned below. It sits inside the sheet's form, so every control here is `type="button"` and
 * Enter in the search field only narrows the list.
 */
function DrillDown({
  title,
  searchLabel,
  query,
  onQuery,
  options,
  pinned,
  grouped,
  noMatchHint,
  onToggle,
  onClear,
  onBack,
  close,
}: {
  title: string;
  searchLabel: string;
  query: string;
  onQuery: (next: string) => void;
  options: ReturnType<typeof regionPickerOptions>;
  pinned: ReadonlySet<string>;
  grouped: boolean;
  noMatchHint: string | undefined;
  onToggle: (value: string) => void;
  onClear: () => void;
  onBack: () => void;
  close: ReactNode;
}) {
  const rows = pickerRows(options, { query, pinned, grouped });
  const chosen = options.filter((option) => option.selected).length;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 px-5 pt-3 pb-2">
        <button
          type="button"
          onClick={onBack}
          aria-label={uk.filters.back}
          className="inline-flex size-target cursor-pointer items-center justify-center rounded-pill text-ink focus-ring"
        >
          <Icon name="chevron-left" />
        </button>
        <h2 className="min-w-0 flex-1 text-center text-title text-ink">{title}</h2>
        {close}
      </div>
      <div className="px-5 pb-3">
        <input
          type="search"
          aria-label={searchLabel}
          placeholder={searchLabel}
          autoComplete="off"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.preventDefault();
          }}
          className="h-13 w-full rounded-field border-2 border-line bg-surface px-5 text-label text-ink placeholder:text-ink-2 focus:border-accent"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3">
        {rows.length === 0 ? (
          <div className="flex flex-col gap-1 px-2 py-4 text-body text-ink-2">
            <span>{uk.filters.cityNoMatch}</span>
            {noMatchHint ? <span>{noMatchHint}</span> : null}
          </div>
        ) : (
          <MultiSelectChecklist
            rows={rows}
            idPrefix={`drill-${grouped ? "region" : "city"}`}
            onToggle={onToggle}
            label={title}
          />
        )}
        <p role="status" className="sr-only">
          {query.trim() === ""
            ? ""
            : fillTemplate(uk.filters.cityFound, { count: String(rows.length) })}
        </p>
      </div>
      <div className="flex items-center gap-2 border-t-2 border-line px-5 pt-3 pb-safe">
        <Button type="button" variant="secondary" onClick={onClear} disabled={chosen === 0}>
          {uk.filters.clearSelection}
        </Button>
        <Button type="button" className="flex-1" onClick={onBack}>
          {uk.filters.done}
        </Button>
      </div>
    </div>
  );
}
