import type {
  AgeBucket,
  AnimalSpecies,
  CityId,
  FeedFilters,
  GallerySort,
  SizeBucket,
} from "@opika/domain";
import { AGE_BUCKETS, ANIMAL_SPECIES, matchesSelection, SIZE_BUCKETS } from "@opika/domain";
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

interface FilterRailProps {
  filters: FeedFilters;
  sort: GallerySort;
  cities: ReadonlyArray<{ id: CityId; name: string }>;
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

const CHIP_BASE =
  "min-h-9 inline-flex items-center rounded-chip px-3 font-sans text-sm leading-none cursor-pointer transition-colors duration-[160ms]";
const CHIP_ACTIVE = "bg-leaf text-paper";
const CHIP_INACTIVE = "bg-paper text-ink-3 border border-line-strong hover:border-line-heavy";

function Chip({
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
      aria-pressed={active}
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
 * is just what a normal link already does. `apps/web/src/features/gallery/
 * history-enhance.tsx` layers `router.replace` on top when JS is present,
 * so this component itself has no client-side behaviour of its own.
 *
 * Visible only at `desktop:` (>=1024) — `hidden desktop:flex`. Below that,
 * `FilterSheet` owns the same filter state through a different UI.
 */
export function FilterRail({ filters, sort, cities }: FilterRailProps) {
  return (
    <aside
      data-testid="filter-rail"
      aria-label={uk.filters.title}
      className="hidden desktop:flex flex-col gap-section w-70 shrink-0 rounded-card border border-line-strong bg-paper p-group h-fit"
    >
      <div className="flex items-center justify-between">
        <span className="font-sans font-medium text-xs tracking-wide text-ink-3 uppercase">
          {uk.filters.title}
        </span>
        <Link
          href={resetFiltersHref(sort)}
          className="min-h-11 flex items-center font-sans text-sm text-ink-3 hover:text-ink-2 hover:underline underline-offset-2"
        >
          {uk.filters.reset}
        </Link>
      </div>

      <fieldset className="flex flex-col gap-label">
        <legend className="font-sans font-medium text-xs tracking-wide text-ink-3 uppercase mb-label">
          {uk.filters.city}
        </legend>
        <div className="flex flex-wrap gap-row">
          <Chip
            active={filters.cities.kind === "any"}
            href={galleryHref({ ...filters, cities: { kind: "any" } }, sort)}
          >
            {uk.filters.allCities}
          </Chip>
          {cities.map((city) => (
            <Chip
              key={city.id}
              active={matchesSelection(filters.cities, city.id)}
              href={galleryHref(withToggledCity(filters, city.id), sort)}
            >
              {city.name}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-label">
        <legend className="font-sans font-medium text-xs tracking-wide text-ink-3 uppercase mb-label">
          {uk.filters.species}
        </legend>
        <div className="flex flex-wrap gap-row">
          {ANIMAL_SPECIES.map((species) => (
            <Chip
              key={species}
              active={matchesSelection(filters.species, species)}
              href={galleryHref(withToggledSpecies(filters, species), sort)}
            >
              {SPECIES_LABEL[species]}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-label">
        <legend className="font-sans font-medium text-xs tracking-wide text-ink-3 uppercase mb-label">
          {uk.filters.size}
        </legend>
        <div className="flex flex-wrap gap-row">
          {SIZE_BUCKETS.map((size) => (
            <Chip
              key={size}
              active={matchesSelection(filters.sizes, size)}
              href={galleryHref(withToggledSize(filters, size), sort)}
            >
              {SIZE_LABEL[size]}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-label">
        <legend className="font-sans font-medium text-xs tracking-wide text-ink-3 uppercase mb-label">
          {uk.filters.age}
        </legend>
        <div className="flex flex-wrap gap-row">
          {AGE_BUCKETS.map((age) => (
            <Chip
              key={age}
              active={matchesSelection(filters.ages, age)}
              href={galleryHref(withToggledAge(filters, age), sort)}
            >
              {AGE_LABEL[age]}
            </Chip>
          ))}
        </div>
      </fieldset>

      <p className="font-sans text-xs text-ink-3 leading-snug">{uk.filters.railFooter}</p>
    </aside>
  );
}
