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
 * `null` for a dimension with no Ukrainian label yet: fur (DR1, S2) reached
 * the filter set before its copy did, and the gallery's URL can't set it
 * until S3, so its suggestion can't arise; should one ever, it is left out
 * rather than shown with a made-up or `[COPY PENDING]` label on a public page.
 */
const DIMENSION_LABEL: Record<FeedFilterDimension, string | null> = {
  cities: uk.filters.city.toLowerCase(),
  species: uk.filters.species.toLowerCase(),
  sizes: uk.filters.size.toLowerCase(),
  ages: uk.filters.age.toLowerCase(),
  coatLengths: null,
};

type LabelledRelaxation = GalleryRelaxation & { label: string };

const labelled = (relaxations: readonly GalleryRelaxation[]): LabelledRelaxation[] =>
  relaxations.flatMap((relaxation) => {
    const label = DIMENSION_LABEL[relaxation.dimension];
    return label === null ? [] : [{ ...relaxation, label }];
  });

function suggestionLabel({ dimension, additional, label }: LabelledRelaxation): string {
  const animalWord = uk.noMatch.additionalAnimals
    .replace("{count}", String(additional))
    .replace("{animalWord}", pluralizeUk(additional, uk.filters.animalWord));

  const template = dimension === "cities" ? uk.noMatch.showAllCities : uk.noMatch.removeDimension;
  return template.replace("{dimension}", label).replace("{animalWord}", animalWord);
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
  const suggestions = labelled(relaxations);
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

      {suggestions.length > 0 && (
        <>
          <div className="flex flex-col gap-2 w-full">
            {suggestions.map((suggestion, index) => (
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
