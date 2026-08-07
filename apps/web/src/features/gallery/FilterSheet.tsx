"use client";

import type {
  AgeBucket,
  AnimalSpecies,
  CityId,
  FeedFilters,
  GallerySort,
  SizeBucket,
} from "@opika/domain";
import {
  AGE_BUCKETS,
  ANIMAL_SPECIES,
  DEFAULT_GALLERY_SORT,
  isExplicitlySelected,
  SIZE_BUCKETS,
} from "@opika/domain";
import { uk } from "@opika/i18n";
import { useEffect, useRef } from "react";
import { resetFiltersHref } from "./filter-url";
import { showCountLabel } from "./gallery-copy";

const SHEET_ID = "tvaryny-filters";

interface FilterSheetProps {
  filters: FeedFilters;
  sort: GallerySort;
  cities: ReadonlyArray<{ id: CityId; name: string }>;
  /** The count a submit right now would show — matches the design's live preview, computed from the *current* (already-applied) filters, same value the rail's result line uses. A checkbox ticked but not yet submitted does not change this number; only a real submission does. */
  resultCount: number;
}

const SPECIES_LABEL: Record<AnimalSpecies, string> = {
  dog: uk.filters.speciesDogs,
  cat: uk.filters.speciesCats,
};
const SIZE_LABEL: Record<SizeBucket, string> = {
  small: uk.filters.sizeSmall,
  medium: uk.filters.sizeMedium,
  large: uk.filters.sizeLarge,
};
const AGE_LABEL: Record<AgeBucket, string> = {
  baby: uk.filters.ageBaby,
  young: uk.filters.ageYoung,
  adult: uk.filters.ageAdult,
  senior: uk.filters.ageSenior,
};

const CHIP_LABEL_BASE =
  "min-h-9 inline-flex items-center rounded-chip px-3 font-sans text-sm leading-none cursor-pointer transition-colors duration-[160ms] has-[:checked]:bg-leaf has-[:checked]:text-paper border border-line-strong has-[:checked]:border-leaf text-ink-3";

/**
 * docs/design/README.md, "03 · Фільтри" + "Rail, count, sort": "Below
 * 1024 it collapses into the existing 03 sheet, extended with sort."
 *
 * A native `<dialog>`, server-rendered without `open`, made visible with
 * **zero JS** via `:target` (`globals.css`, `#tvaryny-filters:target`) —
 * the trigger is a plain `<a href="#tvaryny-filters">`, an ordinary
 * anchor jump. The `<form method="GET">` inside needs no JS either:
 * checkboxes/radios sharing a `name` are exactly the native primitive a
 * GET submission turns into repeated query params, which
 * `filter-url.ts`'s `parseGalleryQuery` reads directly.
 *
 * JS, when present, upgrades the same markup rather than replacing it:
 * the trigger's click is intercepted to call `showModal()` instead of
 * navigating the hash (real focus trap, real Esc-to-close, a backdrop —
 * all native `<dialog>` behaviour, not hand-rolled), and this component
 * adds only what `showModal()` doesn't provide for free: locking
 * background scroll, and returning focus to the trigger on close.
 */
export function FilterSheet({ filters, sort, cities, resultCount }: FilterSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const onClose = () => {
      document.body.style.overflow = "";
      triggerRef.current?.focus();
      // Clear the fragment left by the no-JS path (or by showModal() having
      // been triggered from a #tvaryny-filters link) so a reload doesn't
      // immediately re-show the sheet.
      if (window.location.hash === `#${SHEET_ID}`) {
        history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    };
    dialog.addEventListener("close", onClose);
    return () => dialog.removeEventListener("close", onClose);
  }, []);

  const openWithJs = (event: React.MouseEvent<HTMLAnchorElement>) => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    event.preventDefault();
    document.body.style.overflow = "hidden";
    dialog.showModal();
  };

  const closeWithJs = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    dialogRef.current?.close();
  };

  return (
    <>
      <a
        ref={triggerRef}
        href={`#${SHEET_ID}`}
        onClick={openWithJs}
        data-testid="filter-sheet-trigger"
        className="desktop:hidden min-h-11 inline-flex items-center rounded-button border border-line-strong bg-paper px-4 font-sans text-sm text-ink-2"
      >
        {uk.feed.filtersLabel}
      </a>

      <dialog
        ref={dialogRef}
        id={SHEET_ID}
        aria-label={uk.filters.title}
        data-testid="filter-sheet"
        // Fixed positioning is stated explicitly rather than left to the
        // <dialog>'s native top-layer centering: showModal() DOES apply its
        // own default centered placement, but this component also has to
        // render as a real, correctly-positioned overlay with no JS at all
        // (revealed only by :target, never entering the top layer), where
        // nothing but this component's own CSS positions it. Relying on
        // showModal()'s defaults for the JS path and something else for the
        // no-JS path would be two different layouts to keep in sync;
        // stating it once here covers both by construction.
        //
        // `z-50` is load-bearing, not decorative: `position: fixed` alone
        // does not guarantee paint order over later DOM siblings unless a
        // stacking context is established — without an explicit z-index,
        // the gallery grid (which comes after this element in the tree)
        // painted its cards' photos through the sheet in the no-JS path,
        // caught by an actual browser render, not by reasoning about it.
        className="desktop:hidden fixed inset-x-0 bottom-0 top-auto z-50 m-0 w-full max-w-none max-h-[85vh] overflow-y-auto rounded-t-[20px] rounded-b-none border-0 bg-paper p-0 backdrop:bg-[#EDE3D2]/80"
      >
        <form method="GET" action="/tvaryny" className="flex flex-col gap-section p-group pb-6">
          <div className="flex items-center justify-between">
            <span
              aria-hidden="true"
              className="mx-auto h-1 w-10 rounded-chip bg-line-strong absolute top-2 left-1/2 -translate-x-1/2"
            />
            <h2 className="font-serif text-lg text-ink">{uk.filters.title}</h2>
            {/* biome-ignore lint/a11y/useValidAnchor: real navigation, not a disguised button — without JS this is the only way to clear #tvaryny-filters and make the :target rule hide the sheet again; a <button> cannot change the URL fragment on its own. */}
            <a
              href="#"
              onClick={closeWithJs}
              aria-label="Закрити"
              className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-button text-ink-3"
            >
              ✕
            </a>
          </div>

          <fieldset className="flex flex-col gap-label">
            <legend className="font-sans font-medium text-xs tracking-wide text-ink-3 uppercase mb-label">
              {uk.filters.city}
            </legend>
            <div className="flex flex-wrap gap-row">
              <a
                href={resetFiltersHref(sort)}
                className={`${CHIP_LABEL_BASE} ${filters.cities.kind === "any" ? "bg-leaf text-paper border-leaf" : ""}`}
              >
                {uk.filters.allCities}
              </a>
              {cities.map((city) => (
                <label key={city.id} className={CHIP_LABEL_BASE}>
                  <input
                    type="checkbox"
                    name="misto"
                    value={city.id}
                    defaultChecked={isExplicitlySelected(filters.cities, city.id)}
                    className="sr-only"
                  />
                  {city.name}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-label">
            <legend className="font-sans font-medium text-xs tracking-wide text-ink-3 uppercase mb-label">
              {uk.filters.species}
            </legend>
            <div className="flex flex-wrap gap-row">
              {ANIMAL_SPECIES.map((species) => (
                <label key={species} className={CHIP_LABEL_BASE}>
                  <input
                    type="checkbox"
                    name="vyd"
                    value={species}
                    defaultChecked={isExplicitlySelected(filters.species, species)}
                    className="sr-only"
                  />
                  {SPECIES_LABEL[species]}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-label">
            <legend className="font-sans font-medium text-xs tracking-wide text-ink-3 uppercase mb-label">
              {uk.filters.size}
            </legend>
            <div className="flex flex-wrap gap-row">
              {SIZE_BUCKETS.map((size) => (
                <label key={size} className={CHIP_LABEL_BASE}>
                  <input
                    type="checkbox"
                    name="rozmir"
                    value={size}
                    defaultChecked={isExplicitlySelected(filters.sizes, size)}
                    className="sr-only"
                  />
                  {SIZE_LABEL[size]}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-label">
            <legend className="font-sans font-medium text-xs tracking-wide text-ink-3 uppercase mb-label">
              {uk.filters.age}
            </legend>
            <div className="flex flex-wrap gap-row">
              {AGE_BUCKETS.map((age) => (
                <label key={age} className={CHIP_LABEL_BASE}>
                  <input
                    type="checkbox"
                    name="vik"
                    value={age}
                    defaultChecked={isExplicitlySelected(filters.ages, age)}
                    className="sr-only"
                  />
                  {AGE_LABEL[age]}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-label">
            <legend className="font-sans font-medium text-xs tracking-wide text-ink-3 uppercase mb-label">
              {uk.filters.sortLabel}
            </legend>
            <div className="flex flex-wrap gap-row">
              <label className={CHIP_LABEL_BASE}>
                <input
                  type="radio"
                  name="sort"
                  value="freshest"
                  defaultChecked={sort === DEFAULT_GALLERY_SORT}
                  className="sr-only"
                />
                {uk.filters.sortFreshest}
              </label>
              <label className={CHIP_LABEL_BASE}>
                <input
                  type="radio"
                  name="sort"
                  value="longest_waiting"
                  defaultChecked={sort === "longest_waiting"}
                  className="sr-only"
                />
                {uk.filters.sortLongestWaiting}
              </label>
            </div>
          </fieldset>

          <p className="font-sans text-xs text-ink-3 leading-snug">{uk.filters.railFooter}</p>

          <div className="flex gap-row">
            <a
              href={resetFiltersHref(sort)}
              className="min-h-13 flex items-center justify-center rounded-button border border-line-strong bg-paper text-ink-3 font-sans text-sm px-5"
            >
              {uk.filters.reset}
            </a>
            <button
              type="submit"
              className="min-h-13 flex-1 rounded-button bg-leaf text-paper font-sans text-sm cursor-pointer"
            >
              {showCountLabel(resultCount)}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
