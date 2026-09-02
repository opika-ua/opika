import type {
  AgeBucket,
  AnimalSpecies,
  CityId,
  FeedFilters,
  GallerySort,
  SizeBucket,
} from "@opika/domain";
import { AGE_BUCKETS, ANIMAL_SPECIES, isExplicitlySelected, SIZE_BUCKETS } from "@opika/domain";
import { uk } from "@opika/i18n";
import Link from "next/link";
import {
  galleryHref,
  resetFiltersHref,
  withToggledAge,
  withToggledCity,
  withToggledSize,
  withToggledSpecies,
} from "./filter-url";
import { sheetResultCount } from "./gallery-copy";

interface FilterRailProps {
  filters: FeedFilters;
  sort: GallerySort;
  cities: ReadonlyArray<{ id: CityId; name: string }>;
  /** For the closing result-count sentence — `Opika Registry System.dc.html`'s
   * B1 frame gives the rail its own copy of the sheet's "Підходить N тварин
   * у M притулках." box, distinct from the "Знайдено…" line above the grid. */
  resultCount: number;
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
 * docs/design/README.md, "Rail...": "Chips: 48 min-height, padding 0 20,
 * radius 999; selected = #101112 fill + white 500; unselected = #F2F2F0
 * fill + ink 400." No border on either state — "the single structural move
 * that does most of the work: borders are gone."
 */
const CHIP_BASE =
  "min-h-12 inline-flex items-center rounded-rg-chip px-5 font-rg text-[15px] leading-none cursor-pointer transition-colors duration-[120ms] ease-rg focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px]";
const CHIP_ACTIVE = "bg-rg-ink text-rg-surface font-medium";
const CHIP_INACTIVE = "bg-rg-fill text-rg-ink";

/**
 * `aria-current`, not `aria-pressed`: an `<a href>` is `role="link"`, and
 * `aria-pressed` is defined only for `role="button"` — a screen reader is
 * free to drop it, and axe reports it as `aria-allowed-attr`. These chips
 * cannot become buttons without giving up being real navigations (which is
 * the whole reason the rail works with no JS), so the selected state is
 * carried by an attribute that IS allowed on any element, plus the design's
 * own visible ✓, which is in the accessible name either way.
 */
/**
 * Exported for `tvaryny/page.tsx`'s first-run band — same chip, same
 * real-navigation-not-checkbox reasoning, reused rather than a second copy
 * of `CHIP_BASE`/`CHIP_ACTIVE`/`CHIP_INACTIVE`.
 */
export function Chip({
  active,
  href,
  children,
}: {
  active: boolean;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`${CHIP_BASE} ${active ? CHIP_ACTIVE : CHIP_INACTIVE}`}
    >
      {active ? "✓ " : ""}
      {children}
    </Link>
  );
}

/**
 * docs/design/README.md, "Rail, count, sort": "paper card, radius 20,
 * padding 16, gap: 24 ... 'Скинути' top-right and no 'Показати' button —
 * changes apply immediately and write to the URL." Every chip is a plain
 * `<a>`, not a checkbox + client handler: a click is a real navigation
 * (works with no JS by construction, not retrofitted), and "immediately"
 * is just what a normal link already does. `ReplaceNav`
 * (`apps/web/src/features/gallery/ReplaceNav.tsx`) layers `router.replace`
 * on top when JS is present, so this component itself has no client-side
 * behaviour of its own.
 *
 * Visible only at `desktop:` (>=1024) — `hidden desktop:flex`. Below that,
 * `FilterSheet` owns the same filter state through a different UI.
 */
export function FilterRail({ filters, sort, cities, resultCount, shelterCount }: FilterRailProps) {
  return (
    <aside
      data-testid="filter-rail"
      aria-label={uk.filters.title}
      className="font-rg hidden desktop:flex flex-col gap-7 w-70 shrink-0 rounded-rg-card bg-rg-surface p-6 h-fit"
    >
      <div className="flex items-baseline justify-between">
        <span className="text-[19px] font-bold tracking-[-0.02em] text-rg-ink">
          {uk.filters.title}
        </span>
        <Link
          href={resetFiltersHref(sort)}
          className="min-h-12 flex items-center text-[15px] text-rg-ink-3 underline underline-offset-2 hover:text-rg-ink-2 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px]"
        >
          {uk.filters.reset}
        </Link>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="font-medium text-xs tracking-[0.06em] text-rg-ink-3 uppercase">
          {uk.filters.city}
        </legend>
        <div className="flex flex-wrap gap-2">
          <Chip
            active={filters.cities.kind === "any"}
            href={galleryHref({ ...filters, cities: { kind: "any" } }, sort)}
          >
            {uk.filters.allCities}
          </Chip>
          {cities.map((city) => (
            <Chip
              key={city.id}
              active={isExplicitlySelected(filters.cities, city.id)}
              href={galleryHref(withToggledCity(filters, city.id), sort)}
            >
              {city.name}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="font-medium text-xs tracking-[0.06em] text-rg-ink-3 uppercase">
          {uk.filters.species}
        </legend>
        <div className="flex flex-wrap gap-2">
          {ANIMAL_SPECIES.map((species) => (
            <Chip
              key={species}
              active={isExplicitlySelected(filters.species, species)}
              href={galleryHref(withToggledSpecies(filters, species), sort)}
            >
              {SPECIES_LABEL[species]}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="font-medium text-xs tracking-[0.06em] text-rg-ink-3 uppercase">
          {uk.filters.size}
        </legend>
        <div className="flex flex-wrap gap-2">
          {SIZE_BUCKETS.map((size) => (
            <Chip
              key={size}
              active={isExplicitlySelected(filters.sizes, size)}
              href={galleryHref(withToggledSize(filters, size), sort)}
            >
              {SIZE_LABEL[size]}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="font-medium text-xs tracking-[0.06em] text-rg-ink-3 uppercase">
          {uk.filters.age}
        </legend>
        <div className="flex flex-wrap gap-2">
          {AGE_BUCKETS.map((age) => (
            <Chip
              key={age}
              active={isExplicitlySelected(filters.ages, age)}
              href={galleryHref(withToggledAge(filters, age), sort)}
            >
              {AGE_LABEL[age]}
            </Chip>
          ))}
        </div>
      </fieldset>

      {/* docs/design/README.md, "Rail...": "Closes with a #F2F2F0 block" —
        both sentences, same box, same as the sheet's own closing block. */}
      <div className="flex flex-col gap-2 rounded-rg-freshness bg-rg-fill p-4">
        <p className="text-[15px]/[22px] text-rg-ink">
          {sheetResultCount(resultCount, shelterCount, filters.cities.kind !== "any")}
        </p>
        <p className="text-[13px]/[18px] text-rg-ink-3">{uk.filters.railFooter}</p>
      </div>
    </aside>
  );
}
