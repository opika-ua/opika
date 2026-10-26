"use client";

import type { AgeBucket, CityId, FeedFilters, GallerySort, SizeBucket } from "@opika/domain";
import { AGE_BUCKETS, isExplicitlySelected, relaxDimension, SIZE_BUCKETS } from "@opika/domain";
import { uk } from "@opika/i18n";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type { CitySlugsById } from "./filter-url";
import { galleryHref, withToggledAge, withToggledCity, withToggledSize } from "./filter-url";
import { ChevronDownIcon } from "./icons";

interface GalleryFilterDropdownsProps {
  filters: FeedFilters;
  sort: GallerySort;
  cities: ReadonlyArray<{ id: CityId; name: string }>;
  citySlugs: CitySlugsById;
}

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
 * A controlled Select, not `<details>`/`<summary>` (the PR's original
 * build). Owner feedback, mid-build, verbatim: "make select component more
 * solid as options are not full width and also click outside doesnt
 * closes the select, do the best practice and overall nicer Select." Three
 * real defects in the `<details>` version this replaces: (1) the options
 * panel sized to its widest option's own content (`w-max`), so a short
 * option like "Малий" didn't fill the same row width as "Великий"; (2)
 * `<details>` has no native "light dismiss" — it only closes on a second
 * click of the summary, never on an outside click; (3) Tailwind's
 * preflight resets `cursor` on form-adjacent interactive elements to
 * `default`, so nothing here looked clickable without an explicit
 * `cursor-pointer`.
 *
 * Still multi-value (`FilterSelection`, toggle chips, never one-of-many)
 * for city/age/size — the hand-off's original "`<select>` if single-value"
 * guidance never applied here regardless of which disclosure mechanism
 * wraps the options, so this stays a list of real toggle links, not a
 * native `<select>` with single-choice semantics.
 *
 * The trailing icon swaps to a clear-all ✕ once a value is set — Oleksii,
 * mid-build, verbatim: "replacing chevron icon with X to clear all filters
 * [in] 1 click... if multiple filters are chosen its hard to reset all of
 * them because it requires tons of clicks." The ✕ glyph and its styling
 * are this app's own existing close affordance (`AnimalOverlay.tsx`,
 * `FilterSheet.tsx`'s own sheet-close button both use the same bare "✕"
 * text, not an icon asset), reused here rather than invented — "same size
 * and color and style for X" was his own instruction. It never rotates
 * (unlike the chevron it replaces, which does on open/close): his words,
 * verbatim, "dont rotate X when filter opens."
 *
 * The clear button is a sibling of the toggle `<button>`, not nested
 * inside it — interactive elements cannot nest in valid HTML, and this one
 * needs its own click handler (navigate to the cleared href, then close
 * the panel) independent of the toggle's open/closed click.
 */
function Dropdown({
  legend,
  active,
  label,
  clearHref,
  children,
}: {
  legend: string;
  active: boolean;
  label: string;
  /** The "clear this dimension" href, shown as a ✕ in place of the chevron once `active`. */
  clearHref: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={legend}
        className={`flex h-13 w-53 min-w-0 cursor-pointer items-center justify-between gap-3 rounded-brand-field border-2 bg-brand-page px-5 font-brand-ui text-[16px]/[1.2] font-semibold transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-brand-accent focus-visible:outline-offset-[3px] ${
          active ? "border-brand-accent text-brand-ink" : "border-brand-line text-brand-muted"
        } ${open ? "border-brand-accent" : ""}`}
      >
        <span className="truncate">{label}</span>
        {/* Reserves the chevron's own slot even when it's replaced, so the
            label's truncation width never shifts between the two states. */}
        <span className="size-5 shrink-0" aria-hidden={active ? undefined : "true"}>
          {!active && (
            <ChevronDownIcon
              className={`size-5 text-brand-ink transition-transform duration-[120ms] ${open ? "rotate-180" : ""}`}
            />
          )}
        </span>
      </button>
      {active && (
        <Link
          prefetch={false}
          href={clearHref}
          onClick={() => setOpen(false)}
          aria-label={uk.filters.clearDimension.replace("{dimension}", legend)}
          data-testid="dropdown-clear"
          className="absolute top-1/2 right-5 flex size-5 -translate-y-1/2 cursor-pointer items-center justify-center text-[16px] text-brand-ink focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-brand-accent focus-visible:outline-offset-[3px]"
        >
          <span aria-hidden="true">✕</span>
        </Link>
      )}
      {open && (
        <fieldset className="absolute top-full left-0 z-20 mt-2 flex w-53 flex-col gap-1 rounded-brand-field border-2 border-brand-line bg-brand-page p-2 shadow-lg">
          <legend className="sr-only">{legend}</legend>
          {children}
        </fieldset>
      )}
    </div>
  );
}

function DropdownOption({
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
 * The gallery-v3 control block's three real dropdowns — city, age, size
 * (Figma `58:1617`). **Decision taken, not built as specified:** the frame
 * shows a fourth, «Стать» (sex), but `FeedFilters` (`packages/domain`) has
 * no sex dimension at all — no param, no toggle helper, no DB predicate.
 * Adding one is a schema/contract/domain/db change, not a skin (the
 * hand-off's own words for the dropdowns: "reuse what exists; this is a
 * skin, not new logic"), and `docs/standing-constraints.md`'s STOP list
 * names exactly this case ("widening a schema for a temporary mode").
 * Shipping a fourth dropdown wired to nothing would be a control that
 * claims to filter and doesn't. Three real dropdowns now; a sex filter, if
 * wanted, is its own follow-up phase.
 *
 * Hidden below `desktop:` — "Below 1024px... Hide the four [here three]
 * dropdowns; «Фільтр» opens the sheet" (`FilterSheet.tsx`, still wired at
 * every width since this PR).
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

  return (
    <div data-testid="gallery-filter-dropdowns" className="hidden items-center gap-3 desktop:flex">
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
    </div>
  );
}
