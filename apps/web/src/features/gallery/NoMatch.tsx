import type { GalleryRelaxation } from "@opika/contracts";
import type { FeedFilterDimension, FeedFilters, GallerySort } from "@opika/domain";
import { pluralizeUk, relaxDimension } from "@opika/domain";
import { uk } from "@opika/i18n";
import Link from "next/link";
import type { CitySlugsById } from "./filter-url";
import { galleryHref } from "./filter-url";

interface NoMatchProps {
  filters: FeedFilters;
  sort: GallerySort;
  citySlugs: CitySlugsById;
  relaxations: readonly GalleryRelaxation[];
}

/**
 * Every surviving dimension (gallery filter restructure removed fur,
 * temperament and colour, the three that needed a sentence of their own -
 * `noMatch.relaxCoat`/`relaxTemperament`/`relaxColour`, DR1 and pet card PR
 * 1b) is a closed universe over a never-null field, like species/size/age
 * always were, so the generic «Прибрати «{dimension}»» template covers all
 * of them with no per-dimension exception left to carry.
 */
const DIMENSION_LABEL: Record<FeedFilterDimension, string> = {
  cities: uk.filters.city.toLowerCase(),
  species: uk.filters.species.toLowerCase(),
  sizes: uk.filters.size.toLowerCase(),
  ages: uk.filters.age.toLowerCase(),
  sexes: uk.filters.sex.toLowerCase(),
};

function suggestionLabel({ dimension, additional }: GalleryRelaxation): string {
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
 * `gallery.relaxationCounts`'s own output (`packages/contracts`) - built
 * and tested in E2, never wired to any UI until now. Ordered by
 * `additional` descending, so rendering it in order already puts "the most
 * useful suggestion first" (the contract's own words) without this
 * component re-sorting anything.
 */
export function NoMatch({ filters, sort, citySlugs, relaxations }: NoMatchProps) {
  return (
    <div
      data-testid="gallery-no-match"
      className="font-brand-ui bg-brand-surface rounded-brand-card py-12 px-8 flex flex-col items-start gap-8"
    >
      <div className="flex flex-col gap-3">
        <h2 className="text-[34px]/[38px] font-bold tracking-[-0.03em] text-brand-ink text-pretty">
          {uk.noMatch.heading}
        </h2>
        <p className="text-[17px]/[26px] text-brand-ink-2 text-pretty">{uk.noMatch.reassurance}</p>
      </div>

      {relaxations.length > 0 && (
        <>
          <div className="flex flex-col gap-2 w-full">
            {relaxations.map((suggestion, index) => (
              <Link
                key={suggestion.dimension}
                href={galleryHref(relaxDimension(filters, suggestion.dimension), sort, citySlugs)}
                data-testid="no-match-suggestion"
                className={`min-h-14 flex items-center justify-center rounded-brand-field font-medium text-[15px] focus-ring ${
                  index === 0 ? "bg-brand-ink text-brand-on-ink" : "bg-brand-line text-brand-ink"
                }`}
              >
                {suggestionLabel(suggestion)}
              </Link>
            ))}
          </div>
          <p className="text-[13px]/[18px] text-brand-muted text-pretty">
            {uk.noMatch.suggestionExplainer}
          </p>
        </>
      )}
    </div>
  );
}
