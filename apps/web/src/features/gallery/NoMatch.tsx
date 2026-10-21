import type { GalleryRelaxation } from "@opika/contracts";
import type { FeedFilterDimension, FeedFilters, GallerySort } from "@opika/domain";
import { pluralizeUk, relaxDimension } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import Link from "next/link";
import type { CitySlugsById } from "./filter-url";
import { galleryHref } from "./filter-url";

interface NoMatchProps {
  filters: FeedFilters;
  sort: GallerySort;
  citySlugs: CitySlugsById;
  relaxations: readonly GalleryRelaxation[];
}

const DIMENSION_LABEL: Record<Exclude<FeedFilterDimension, "coatLengths">, string> = {
  cities: uk.filters.city.toLowerCase(),
  species: uk.filters.species.toLowerCase(),
  sizes: uk.filters.size.toLowerCase(),
  ages: uk.filters.age.toLowerCase(),
};

/**
 * Fur has a sentence of its own (his `noMatch.relaxCoat`, DR1), so it never
 * goes through «Прибрати «{dimension}»»: the bare count is his template's
 * whole number, with no noun to agree with it.
 */
function suggestionLabel({ dimension, additional }: GalleryRelaxation): string {
  if (dimension === "coatLengths") {
    return fillTemplate(uk.noMatch.relaxCoat, { count: String(additional) });
  }
  const animalWord = uk.noMatch.additionalAnimals
    .replace("{count}", String(additional))
    .replace("{animalWord}", pluralizeUk(additional, uk.filters.animalWord));

  const template = dimension === "cities" ? uk.noMatch.showAllCities : uk.noMatch.removeDimension;
  return template
    .replace("{dimension}", DIMENSION_LABEL[dimension])
    .replace("{animalWord}", animalWord);
}

/**
 * docs/design/README.md, "Gallery states" > "No match": "white card, radius
 * 24, padding 48 32, gap: 32... two 56px actions that name their yield...
 * No suggestion without a number." `relaxations` is
 * `gallery.relaxationCounts`'s own output (`packages/contracts`) — built
 * and tested in E2, never wired to any UI until now. Ordered by
 * `additional` descending, so rendering it in order already puts "the most
 * useful suggestion first" (the contract's own words) without this
 * component re-sorting anything.
 */
export function NoMatch({ filters, sort, citySlugs, relaxations }: NoMatchProps) {
  return (
    <div
      data-testid="gallery-no-match"
      className="font-rg bg-rg-surface rounded-rg-card py-12 px-8 flex flex-col items-start gap-8"
    >
      <div className="flex flex-col gap-3">
        <h2 className="text-[34px]/[38px] font-bold tracking-[-0.03em] text-rg-ink text-pretty">
          {uk.noMatch.heading}
        </h2>
        <p className="text-[17px]/[26px] text-rg-ink-2 text-pretty">{uk.noMatch.reassurance}</p>
      </div>

      {relaxations.length > 0 && (
        <>
          <div className="flex flex-col gap-2 w-full">
            {relaxations.map((suggestion, index) => (
              <Link
                key={suggestion.dimension}
                href={galleryHref(relaxDimension(filters, suggestion.dimension), sort, citySlugs)}
                data-testid="no-match-suggestion"
                className={`min-h-14 flex items-center justify-center rounded-rg-button font-medium text-[15px] focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px] ${
                  index === 0 ? "bg-rg-ink text-rg-surface" : "bg-rg-fill text-rg-ink"
                }`}
              >
                {suggestionLabel(suggestion)}
              </Link>
            ))}
          </div>
          <p className="text-[13px]/[18px] text-rg-ink-3 text-pretty">
            {uk.noMatch.suggestionExplainer}
          </p>
        </>
      )}
    </div>
  );
}
