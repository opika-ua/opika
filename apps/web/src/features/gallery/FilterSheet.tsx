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
  ANY,
  DEFAULT_GALLERY_SORT,
  isExplicitlySelected,
  SIZE_BUCKETS,
} from "@opika/domain";
import { uk } from "@opika/i18n";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
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
  cities: ReadonlyArray<{ id: CityId; name: string }>;
  /** The count a submit right now would show — matches the design's live preview, computed from the *current* (already-applied) filters, same value the rail's result line uses. A checkbox ticked but not yet submitted does not change this number; only a real submission does. */
  resultCount: number;
  /** For the sheet's own "Підходить N тварин у M притулках." sentence — `Opika Registry System.dc.html`'s B6 frame, same sentence the rail's closing box shows. */
  shelterCount: number;
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

/**
 * `has-[:focus-visible]:` is not a nicety here: the real `<input>` is
 * `sr-only` (1x1, clipped), so the focus ring the browser draws on it is
 * drawn on a pixel nobody can see. Without lifting that ring onto the
 * visible `<label>`, a keyboard user tabbing through the sheet has no
 * indication of where they are — docs/design/README.md's "Keyboard" table
 * routes Tab through these controls, and its focus-visible rule
 * (`outline: 2px solid #4F6B3A; outline-offset: 2px`) is stated as "never
 * removed", which drawing it where nobody can see it is a way of removing.
 */
const CHIP_LABEL_BASE =
  "min-h-12 inline-flex items-center rounded-rg-chip px-5 font-rg text-[15px] leading-none cursor-pointer transition-colors duration-[120ms] ease-rg has-[:checked]:bg-rg-ink has-[:checked]:text-rg-surface has-[:checked]:font-medium bg-rg-fill text-rg-ink has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-rg-registry has-[:focus-visible]:outline-offset-[3px]";

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
export function FilterSheet({
  filters,
  sort,
  cities,
  resultCount,
  shelterCount,
}: FilterSheetProps) {
  const router = useRouter();
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

  /**
   * Two ways this sheet can be on screen, and only one of them has an
   * `open` attribute. `showModal()` sets it; the no-JS `:target` reveal
   * (`globals.css`) does not — and `HTMLDialogElement.close()` on a dialog
   * without `open` returns immediately, firing no `close` event. So when
   * the sheet was revealed by the fragment — a click on the trigger before
   * hydration finished, or a shared/bookmarked URL already carrying
   * `#tvaryny-filters` — swallowing this anchor's own navigation would
   * leave the ✕ dead and the sheet unclosable. Falling through to the
   * plain `href="#"` clears the fragment, which is exactly what closes it
   * in that state, with or without JS.
   */
  const closeWithJs = (event: React.MouseEvent<HTMLAnchorElement>) => {
    const dialog = dialogRef.current;
    if (!dialog?.open) return;
    event.preventDefault();
    dialog.close();
  };

  /**
   * `router.replace`, not the default push a real `<a>`/form GET produces
   * — same "ten clicks, ten history entries" reasoning as `ReplaceNav`
   * (`apps/web/src/features/gallery/ReplaceNav.tsx`), applied here instead
   * of wrapping this component in it: `FilterSheet` is already a Client
   * Component with its own dialog-close bookkeeping, so a second layer of
   * click interception would just be two mechanisms doing the same job.
   */
  const navigateWithJs = (href: string) => {
    dialogRef.current?.close();
    router.replace(href, { scroll: false });
  };

  /**
   * "Уся Київщина" drops the city constraint and nothing else — the same
   * href the rail's own chip carries (`FilterRail`), and what
   * docs/design/README.md's deviation note says the string means: "what
   * the button actually does today, which is drop the city filter
   * entirely." It is a МІСТО-group chip, not a second "Скинути": clearing
   * species/size/age from here would silently discard choices the adopter
   * made in three other groups.
   */
  const allCitiesHref = galleryHref({ ...filters, cities: ANY }, sort);

  const onAllCitiesClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    navigateWithJs(allCitiesHref);
  };

  const onResetClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    navigateWithJs(resetFiltersHref(sort));
  };

  /**
   * The submitted form is read back through the same `parseGalleryQuery` a
   * cold request goes through and written out through the same
   * `galleryHref` the rail's chips use, rather than assembling a URL of
   * its own — so the same state reached through the sheet and through the
   * rail produces the same URL, not two equivalent-but-different-looking
   * ones. Two things that would otherwise need restating here come free
   * with that: a radio group always submits, so a native submission always
   * carries `sort` even at its default, and `galleryHref` already omits a
   * default sort; and a group with every value checked canonicalizes back
   * to "unconstrained" instead of spelling out the universe.
   *
   * The no-JS path is untouched by this — the browser submits the form
   * itself and the server reads the repeated params through the same
   * parser. This enhances that path; it does not replace it.
   */
  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitted = parseGalleryQuery(
      searchParamsFromFormData(new FormData(event.currentTarget)),
    );
    navigateWithJs(galleryHref(submitted.filters, submitted.sort));
  };

  return (
    <>
      <a
        ref={triggerRef}
        href={`#${SHEET_ID}`}
        onClick={openWithJs}
        data-testid="filter-sheet-trigger"
        className="font-rg desktop:hidden min-h-12 inline-flex items-center rounded-rg-button bg-rg-fill px-4 text-[15px] text-rg-ink focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px]"
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
        className="font-rg desktop:hidden fixed inset-x-0 bottom-0 top-auto z-50 m-0 w-full max-w-none max-h-[85vh] overflow-y-auto rounded-t-[24px] rounded-b-none border-0 bg-rg-surface p-0 shadow-rg-card backdrop:bg-[#B9B9B5]/80"
      >
        {/*
          `key` is what keeps this form honest. Its inputs are uncontrolled
          (`defaultChecked`), and React writes a changed `defaultChecked`
          to the *attribute* only — an input the adopter has actually
          clicked keeps its own dirty checkedness regardless. So after any
          filter change that did NOT come from submitting this form
          ("Скинути", "Уся Київщина", the back button), the boxes would go
          on showing what was last clicked while the URL says something
          else: hidden client state outliving the URL that is supposed to
          be the only source of truth. Keying the subtree on the applied
          state remounts the inputs whenever it changes, so what is ticked
          is always what the address bar says.
        */}
        <form
          key={galleryHref(filters, sort)}
          method="GET"
          action="/tvaryny"
          onSubmit={onSubmit}
          className="flex flex-col gap-7 pt-4 px-5 pb-6"
        >
          <div className="flex items-center justify-between">
            <span
              aria-hidden="true"
              className="mx-auto h-[5px] w-12 rounded-rg-chip bg-rg-fill-strong absolute top-4 left-1/2 -translate-x-1/2"
            />
            <h2 className="text-[24px]/[28px] font-bold tracking-[-0.02em] text-rg-ink">
              {uk.filters.title}
            </h2>
            {/* biome-ignore lint/a11y/useValidAnchor: real navigation, not a disguised button — without JS this is the only way to clear #tvaryny-filters and make the :target rule hide the sheet again; a <button> cannot change the URL fragment on its own. */}
            <a
              href="#"
              onClick={closeWithJs}
              aria-label="Закрити"
              className="min-h-12 min-w-12 inline-flex items-center justify-center rounded-rg-button text-rg-ink-3 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px]"
            >
              ✕
            </a>
          </div>

          <fieldset className="flex flex-col gap-3">
            <legend className="font-medium text-xs tracking-[0.06em] text-rg-ink-3 uppercase">
              {uk.filters.city}
            </legend>
            <div className="flex flex-wrap gap-2">
              <a
                href={allCitiesHref}
                onClick={onAllCitiesClick}
                className={`${CHIP_LABEL_BASE} ${filters.cities.kind === "any" ? "bg-rg-ink text-rg-surface font-medium" : ""}`}
              >
                {uk.filters.allCities}
              </a>
              {cities.map((city) => (
                <label key={city.id} className={CHIP_LABEL_BASE}>
                  <input
                    type="checkbox"
                    name={GALLERY_PARAM.city}
                    value={city.id}
                    defaultChecked={isExplicitlySelected(filters.cities, city.id)}
                    className="sr-only"
                  />
                  {city.name}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="font-medium text-xs tracking-[0.06em] text-rg-ink-3 uppercase">
              {uk.filters.species}
            </legend>
            <div className="flex flex-wrap gap-2">
              {ANIMAL_SPECIES.map((species) => (
                <label key={species} className={CHIP_LABEL_BASE}>
                  <input
                    type="checkbox"
                    name={GALLERY_PARAM.species}
                    value={species}
                    defaultChecked={isExplicitlySelected(filters.species, species)}
                    className="sr-only"
                  />
                  {SPECIES_LABEL[species]}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="font-medium text-xs tracking-[0.06em] text-rg-ink-3 uppercase">
              {uk.filters.size}
            </legend>
            <div className="flex flex-wrap gap-2">
              {SIZE_BUCKETS.map((size) => (
                <label key={size} className={CHIP_LABEL_BASE}>
                  <input
                    type="checkbox"
                    name={GALLERY_PARAM.size}
                    value={size}
                    defaultChecked={isExplicitlySelected(filters.sizes, size)}
                    className="sr-only"
                  />
                  {SIZE_LABEL[size]}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="font-medium text-xs tracking-[0.06em] text-rg-ink-3 uppercase">
              {uk.filters.age}
            </legend>
            <div className="flex flex-wrap gap-2">
              {AGE_BUCKETS.map((age) => (
                <label key={age} className={CHIP_LABEL_BASE}>
                  <input
                    type="checkbox"
                    name={GALLERY_PARAM.age}
                    value={age}
                    defaultChecked={isExplicitlySelected(filters.ages, age)}
                    className="sr-only"
                  />
                  {AGE_LABEL[age]}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="font-medium text-xs tracking-[0.06em] text-rg-ink-3 uppercase">
              {uk.filters.sortLabel}
            </legend>
            <div className="flex flex-wrap gap-2">
              <label className={CHIP_LABEL_BASE}>
                <input
                  type="radio"
                  name={GALLERY_PARAM.sort}
                  value="freshest"
                  defaultChecked={sort === DEFAULT_GALLERY_SORT}
                  className="sr-only"
                />
                {uk.filters.sortFreshest}
              </label>
              <label className={CHIP_LABEL_BASE}>
                <input
                  type="radio"
                  name={GALLERY_PARAM.sort}
                  value="longest_waiting"
                  defaultChecked={sort === "longest_waiting"}
                  className="sr-only"
                />
                {uk.filters.sortLongestWaiting}
              </label>
            </div>
          </fieldset>

          {/* docs/design/README.md, "Sheet": the same closing sentence pair
            the rail's own box shows, immediately above the footer buttons
            here rather than in its own filled block — `Opika Registry
            System.dc.html`'s B6 frame nests both directly in the form's
            own flow, not in a separate fill. */}
          <div className="flex flex-col gap-3">
            <p className="text-[15px]/[22px] text-rg-ink-2">
              {sheetResultCount(resultCount, shelterCount, filters.cities.kind !== "any")}
            </p>
            <div className="flex gap-2">
              <a
                href={resetFiltersHref(sort)}
                onClick={onResetClick}
                className="min-h-14 flex items-center justify-center rounded-rg-button bg-rg-fill text-rg-ink font-medium text-[15px] px-6 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px]"
              >
                {uk.filters.reset}
              </a>
              <button
                type="submit"
                className="min-h-14 flex-1 rounded-rg-button bg-rg-ink text-rg-surface font-medium text-[15px] cursor-pointer focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px]"
              >
                {showCountLabel(resultCount)}
              </button>
            </div>
          </div>
        </form>
      </dialog>
    </>
  );
}
