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

/**
 * Fur has a sentence of its own (his `noMatch.relaxCoat`, DR1), so it never
 * goes through «Прибрати «{dimension}»»: the bare count is his template's
 * whole number, with no noun to agree with it. Temperament and colour (pet
 * card PR 1b) follow fur's pattern, «Будь-який характер: +{count}» and
 * «Будь-яке забарвлення: +{count}».
 */
const OWN_SENTENCE = {
  coatLengths: uk.noMatch.relaxCoat,
  temperaments: uk.noMatch.relaxTemperament,
  colours: uk.noMatch.relaxColour,
} as const satisfies Partial<Record<FeedFilterDimension, string>>;
type OwnSentenceDimension = keyof typeof OWN_SENTENCE;

const hasOwnSentence = (dimension: FeedFilterDimension): dimension is OwnSentenceDimension =>
  Object.hasOwn(OWN_SENTENCE, dimension);

const DIMENSION_LABEL: Record<Exclude<FeedFilterDimension, OwnSentenceDimension>, string> = {
  cities: uk.filters.city.toLowerCase(),
  species: uk.filters.species.toLowerCase(),
  sizes: uk.filters.size.toLowerCase(),
  ages: uk.filters.age.toLowerCase(),
  // Sex (sex-filter feature) is a closed universe like species/size/age, not
  // the null-admitting shape fur/temperament/colour have above, so it needs
  // no own sentence - the generic «Прибрати «{dimension}»» template is
  // exactly as true for it as it already is for species.
  sexes: uk.filters.sex.toLowerCase(),
};

function suggestionLabel({ dimension, additional }: GalleryRelaxation): string {
  if (hasOwnSentence(dimension)) {
    return fillTemplate(OWN_SENTENCE[dimension], { count: String(additional) });
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
                className={`min-h-14 flex items-center justify-center rounded-brand-field font-medium text-[15px] focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-brand-accent focus-visible:outline-offset-[3px] ${
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
