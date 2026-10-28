"use client";

import type {
  AgeBucket,
  AnimalSex,
  AnimalSpecies,
  CityId,
  FeedFilters,
  GallerySort,
  SizeBucket,
} from "@opika/domain";
import {
  AGE_BUCKETS,
  ANIMAL_SEXES,
  isExplicitlySelected,
  relaxDimension,
  SIZE_BUCKETS,
} from "@opika/domain";
import { uk } from "@opika/i18n";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type { CitySlugsById } from "./filter-url";
import {
  galleryHref,
  withOnlySpecies,
  withToggledAge,
  withToggledCity,
  withToggledSex,
  withToggledSize,
} from "./filter-url";
import { ChevronDownIcon } from "./icons";

interface GalleryFilterDropdownsProps {
  filters: FeedFilters;
  sort: GallerySort;
  cities: ReadonlyArray<{ id: CityId; name: string }>;
  citySlugs: CitySlugsById;
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
const SEX_LABEL: Record<AnimalSex, string> = {
  male: uk.filters.sexMale,
  female: uk.filters.sexFemale,
  unknown: uk.filters.sexUnknown,
};

/**
 * A controlled Select, not `<details>`/`<summary>` (the PR's original
 * build). Owner feedback, mid-build, verbatim: "make select component more
 * solid as options are not full width and also click outside doesnt
 * closes the select, do the best practice and overall nicer Select." Three
 * real defects in the `<details>` version this replaces: (1) the options
 * panel sized to its widest option's own content (`w-max`), so a short
 * option like "Малий" didn't fill the same row width as "Великий"; (2)
 * `<details>` has no native "light dismiss" - it only closes on a second
 * click of the summary, never on an outside click; (3) Tailwind's
 * preflight resets `cursor` on form-adjacent interactive elements to
 * `default`, so nothing here looked clickable without an explicit
 * `cursor-pointer`.
 *
 * Still multi-value (`FilterSelection`, toggle chips, never one-of-many)
 * for every dimension here - the hand-off's original "`<select>` if
 * single-value" guidance never applied regardless of which disclosure
 * mechanism wraps the options, so this stays a list of real toggle links,
 * not a native `<select>` with single-choice semantics.
 *
 * The trailing icon swaps to a clear-all ✕ once a value is set - Oleksii,
 * mid-build, verbatim: "replacing chevron icon with X to clear all filters
 * [in] 1 click... if multiple filters are chosen its hard to reset all of
 * them because it requires tons of clicks." The ✕ glyph and its styling
 * are this app's own existing close affordance (`AnimalOverlay.tsx`,
 * `FilterSheet.tsx`'s own sheet-close button both use the same bare "✕"
 * text, not an icon asset), reused here rather than invented - "same size
 * and color and style for X" was his own instruction. It never rotates
 * (unlike the chevron it replaces, which does on open/close): his words,
 * verbatim, "dont rotate X when filter opens."
 *
 * The clear button is a sibling of the toggle `<button>`, not nested
 * inside it - interactive elements cannot nest in valid HTML, and this one
 * needs its own click handler (navigate to the cleared href, then close
 * the panel) independent of the toggle's open/closed click.
 */
export function Dropdown({
  legend,
  active,
  label,
  clearHref,
  children,
}: {
  legend: string;
  active: boolean;
  label: string;
  /**
   * The "clear this dimension" href, shown as a ✕ in place of the chevron
   * once `active`. Omitted entirely by `GallerySortToggle`'s own dropdown
   * (gallery filter restructure): sort always carries a real value, so
   * there is nothing to clear back to "any" - that control passes no
   * `clearHref` and always sees the chevron instead, regardless of
   * `active`.
   */
  clearHref?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        // Escape returns focus to the trigger (WAI-ARIA APG's listbox/combobox
        // pattern); an outside click doesn't need this - focus already moved
        // to whatever the pointer landed on.
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    // flex-initial (content-sized, never grows): the earlier flex-1 fix
    // solved a narrow-orphan problem at five dropdowns, but at seven it
    // produces the opposite one - two leftover items alone on a wrapped
    // row stretch to ~545px each, filling the row rather than sitting at a
    // sensible width (design critique, 2026-10-27). Sizing to each
    // button's own content - its label plus the chevron/clear slot - means
    // a short last row just ends instead of ballooning; min-w is still the
    // floor that keeps any one dropdown from shrinking past readability.
    <div ref={rootRef} className="relative min-w-[11rem] flex-initial">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        // Composed, not the bare legend: the legend alone ("МІСТО") would
        // drop the visible selected value ("Бровари") from the accessible
        // name, failing WCAG 2.5.3 (Label in Name) against the visible
        // <span> below. Ending with `label` verbatim is what satisfies it.
        aria-label={`${legend}: ${label}`}
        className={`flex h-13 w-full min-w-0 cursor-pointer items-center justify-between gap-3 rounded-brand-field border-2 bg-brand-page px-5 font-brand-ui text-[16px]/[1.2] font-semibold transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-brand-accent focus-visible:outline-offset-[3px] ${
          active ? "border-brand-accent text-brand-ink" : "border-brand-line text-brand-muted"
        } ${open ? "border-brand-accent" : ""}`}
      >
        {/* `uppercase` only on the placeholder, never on a selected value -
            city/age/size/species's own legends ("МІСТО"/"ВІК"/"РОЗМІР"/"ВИД")
            happen to already be uppercase strings, but fur's own approved
            text (`uk.filters.coat`, "Шерсть") isn't, which is what made it
            look inconsistent. Styling this here, once, generically on
            `!active`, fixes that without touching any dimension's approved
            Ukrainian - a selected value (e.g. "Бровари") still renders in
            its own natural case regardless of dimension. */}
        <span className={`truncate ${active ? "" : "uppercase"}`}>{label}</span>
        {/* Reserves the chevron's own slot even when it's replaced, so the
            label's truncation width never shifts between the two states. */}
        <span
          className="size-5 shrink-0"
          aria-hidden={active && clearHref !== undefined ? undefined : "true"}
        >
          {!(active && clearHref !== undefined) && (
            <ChevronDownIcon
              className={`size-5 text-brand-ink transition-transform duration-[120ms] ${open ? "rotate-180" : ""}`}
            />
          )}
        </span>
      </button>
      {active && clearHref !== undefined && (
        <Link
          prefetch={false}
          href={clearHref}
          onClick={() => setOpen(false)}
          aria-label={uk.filters.clearDimension.replace("{dimension}", legend)}
          data-testid="dropdown-clear"
          // 48px hit area (min-h-12/min-w-12), matching FilterSheet.tsx's own
          // "✕" close affordance - the same glyph at size-5 (20px) was below
          // both the 48px floor this app uses elsewhere and WCAG 2.5.8's 24px
          // minimum target size. `right-1.5` (not `right-5`) keeps the glyph
          // itself centered on the same spot the chevron it replaces occupies
          // - only the invisible padding around it grew.
          className="absolute top-1/2 right-1.5 flex min-h-12 min-w-12 -translate-y-1/2 cursor-pointer items-center justify-center text-[16px] text-brand-ink focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-brand-accent focus-visible:outline-offset-[3px]"
        >
          <span aria-hidden="true">✕</span>
        </Link>
      )}
      {open && (
        <fieldset className="absolute top-full left-0 z-20 mt-2 flex w-full min-w-53 flex-col gap-1 rounded-brand-field border-2 border-brand-line bg-brand-page p-2 shadow-lg">
          <legend className="sr-only">{legend}</legend>
          {children}
        </fieldset>
      )}
    </div>
  );
}

export function DropdownOption({
  active,
  href,
  children,
}: {
  active: boolean;
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      prefetch={false}
      href={href}
      aria-current={active ? "true" : undefined}
      className={`flex min-h-12 w-full cursor-pointer items-center rounded-brand-field px-3 text-[16px]/[1.2] transition-colors hover:bg-brand-line focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-brand-accent focus-visible:outline-offset-[3px] ${
        active ? "font-semibold text-brand-ink" : "text-brand-ink-2"
      }`}
    >
      {active ? "✓ " : ""}
      {children}
    </Link>
  );
}

/**
 * The species filter's own control (gallery filter restructure, decision
 * taken: no mock exists for this exact shape). A three-way segmented
 * toggle - «Усі» / «Собаки» / «Коти» - replacing the dropdown every other
 * dimension here still uses: exclusive choice, not the dropdown's
 * multi-select, so `withOnlySpecies` (`filter-url.ts`) writes the next
 * href rather than the toggle-add/remove every `withToggledX` helper uses.
 *
 * Visual language matches `GallerySortToggle`'s own pill (`rounded-brand-
 * pill`, ink/surface fill, the same focus-visible treatment), but as three
 * plain buttons rather than a sliding knob - a knob reads cleanly between
 * two positions; a third state ("any") has no natural slot on a two-ended
 * track.
 */
function SpeciesToggle({
  filters,
  sort,
  citySlugs,
}: {
  filters: FeedFilters;
  sort: GallerySort;
  citySlugs: CitySlugsById;
}) {
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
    <fieldset
      aria-label={uk.filters.species}
      data-testid="species-toggle"
      className="flex shrink-0 items-center gap-1 rounded-brand-pill border-2 border-brand-line bg-brand-page p-1"
    >
      {options.map(({ species, label, testid }) => {
        const active =
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
            aria-current={active ? "true" : undefined}
            data-testid={testid}
            className={`flex min-h-target min-w-11 items-center justify-center rounded-brand-pill px-3 text-[16px]/[1.2] font-semibold transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-brand-accent focus-visible:outline-offset-[3px] ${
              active ? "bg-brand-ink text-brand-surface" : "text-brand-muted"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </fieldset>
  );
}

/**
 * The gallery-v3 control block's real controls - city, age, size, a
 * species toggle, then sex (the four survivors, gallery filter
 * restructure). Figma `58:1617` shows four dropdowns, city/age/size/
 * «Стать»; fur, temperament and colour (added later, GV3-Q1 (b) and pet
 * card PR 1b) are gone again with this restructure - found harder to use
 * well than to use at all - and species moved from a dropdown to the
 * `SpeciesToggle` above, which this restructure's own text description
 * specified directly ("kind filter like dogs or cats becomes a toggle").
 *
 * **«Стать» (sex) stays a dropdown**, unaffected by the restructure except
 * for sitting at the deck's own filter-words header differently now that
 * it isn't the last dropdown added: `FeedFilters` carries `sexes`
 * (`feed-filters.ts`), `feed-predicate.ts` has the `IN` clause, and this
 * dropdown is its one caller beside the sheet - wired end to end, not a
 * control that claims to filter and doesn't. Options are «Хлопчик»/
 * «Дівчинка»/«Не записано» (`ANIMAL_SEXES`, a closed universe like
 * species/size/age - "unknown" is a real, explicit value, not an absence).
 *
 * Hidden below `desktop:` - "Below 1024px... Hide the dropdowns; «Фільтр»
 * opens the sheet" (`FilterSheet.tsx`, still wired at every width).
 */
export function GalleryFilterDropdowns({
  filters,
  sort,
  cities,
  citySlugs,
}: GalleryFilterDropdownsProps) {
  const cityActive = filters.cities.kind !== "any";
  const cityLabel = cityActive
    ? cities
        .filter((city) => isExplicitlySelected(filters.cities, city.id))
        .map((city) => city.name)
        .join(", ")
    : uk.filters.city;

  const ageActive = filters.ages.kind !== "any";
  const ageLabel = ageActive
    ? AGE_BUCKETS.filter((age) => isExplicitlySelected(filters.ages, age))
        .map((age) => AGE_LABEL[age])
        .join(", ")
    : uk.filters.age;

  const sizeActive = filters.sizes.kind !== "any";
  const sizeLabel = sizeActive
    ? SIZE_BUCKETS.filter((size) => isExplicitlySelected(filters.sizes, size))
        .map((size) => SIZE_LABEL[size])
        .join(", ")
    : uk.filters.size;

  const sexActive = filters.sexes.kind !== "any";
  const sexLabel = sexActive
    ? ANIMAL_SEXES.filter((sex) => isExplicitlySelected(filters.sexes, sex))
        .map((sex) => SEX_LABEL[sex])
        .join(", ")
    : uk.filters.sex;

  return (
    <div
      data-testid="gallery-filter-dropdowns"
      // flex-wrap: five dropdowns at their natural w-53 (212px) plus four
      // gap-3 (12px) gaps come to 1108px - wider than the 912px of content
      // width the page's own desktop:px-14 gutters leave at the 1024px
      // desktop floor (measured live, not assumed).
      // This container is `flex-1` so the whole group takes the room the
      // sort switch leaves - separate from each individual `Dropdown`,
      // which is `flex-initial` (content-sized, see that component) rather
      // than stretched to fill its row.
      className="hidden min-w-0 flex-1 flex-wrap items-center gap-3 desktop:flex"
    >
      <Dropdown
        legend={uk.filters.city}
        active={cityActive}
        label={cityLabel}
        clearHref={galleryHref(relaxDimension(filters, "cities"), sort, citySlugs)}
      >
        {cities.map((city) => (
          <DropdownOption
            key={city.id}
            active={isExplicitlySelected(filters.cities, city.id)}
            href={galleryHref(withToggledCity(filters, city.id), sort, citySlugs)}
          >
            {city.name}
          </DropdownOption>
        ))}
      </Dropdown>

      <Dropdown
        legend={uk.filters.age}
        active={ageActive}
        label={ageLabel}
        clearHref={galleryHref(relaxDimension(filters, "ages"), sort, citySlugs)}
      >
        {AGE_BUCKETS.map((age) => (
          <DropdownOption
            key={age}
            active={isExplicitlySelected(filters.ages, age)}
            href={galleryHref(withToggledAge(filters, age), sort, citySlugs)}
          >
            {AGE_LABEL[age]}
          </DropdownOption>
        ))}
      </Dropdown>

      <Dropdown
        legend={uk.filters.size}
        active={sizeActive}
        label={sizeLabel}
        clearHref={galleryHref(relaxDimension(filters, "sizes"), sort, citySlugs)}
      >
        {SIZE_BUCKETS.map((size) => (
          <DropdownOption
            key={size}
            active={isExplicitlySelected(filters.sizes, size)}
            href={galleryHref(withToggledSize(filters, size), sort, citySlugs)}
          >
            {SIZE_LABEL[size]}
          </DropdownOption>
        ))}
      </Dropdown>

      <SpeciesToggle filters={filters} sort={sort} citySlugs={citySlugs} />

      <Dropdown
        legend={uk.filters.sex}
        active={sexActive}
        label={sexLabel}
        clearHref={galleryHref(relaxDimension(filters, "sexes"), sort, citySlugs)}
      >
        {ANIMAL_SEXES.map((sex) => (
          <DropdownOption
            key={sex}
            active={isExplicitlySelected(filters.sexes, sex)}
            href={galleryHref(withToggledSex(filters, sex), sort, citySlugs)}
          >
            {SEX_LABEL[sex]}
          </DropdownOption>
        ))}
      </Dropdown>
    </div>
  );
}
