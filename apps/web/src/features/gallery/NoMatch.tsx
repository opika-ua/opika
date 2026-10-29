import type { GalleryRelaxation } from "@opika/contracts";
import type { FeedFilterDimension, FeedFilters, GallerySort, RegionId } from "@opika/domain";
import { ANY, pluralizeUk, relaxDimension } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import { LinkButton } from "../../ui/Button";
import { Heading } from "../../ui/Heading";
import { Panel } from "../../ui/Panel";
import { Text } from "../../ui/Text";
import type { CitySlugsById } from "./filter-url";
import { galleryHref } from "./filter-url";

interface NoMatchProps {
  filters: FeedFilters;
  sort: GallerySort;
  citySlugs: CitySlugsById;
  relaxations: readonly GalleryRelaxation[];
  /**
   * Next-door oblasts that do have animals under the other filters, most first (the page picks
   * them from the facet counts, whose location count ignores the chosen oblasts). Only passed
   * when an oblast is chosen; empty otherwise.
   */
  neighbourRegions?: ReadonlyArray<{ id: RegionId; label: string; count: number }>;
  /**
   * Whether the chosen oblasts hold no animal at all. True only when nothing but the oblast is
   * constrained and its facet count is zero (the page decides, `regionHoldsNoAnimals`): with
   * another filter set, "no animals here" would claim more than the count shows.
   */
  regionEmpty?: boolean;
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
  regions: uk.filters.region.toLowerCase(),
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

  const template =
    dimension === "cities"
      ? uk.noMatch.showAllCities
      : dimension === "regions"
        ? uk.noMatch.showAllRegions
        : uk.noMatch.removeDimension;
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
export function NoMatch({
  filters,
  sort,
  citySlugs,
  relaxations,
  neighbourRegions = [],
  regionEmpty = false,
}: NoMatchProps) {
  return (
    <Panel
      padding="lg"
      className="flex flex-col items-start gap-8 py-12"
      aria-labelledby="gallery-no-match-heading"
      as="section"
    >
      <div data-testid="gallery-no-match" className="flex w-full flex-col items-start gap-8">
        <div className="flex flex-col gap-3">
          <Heading level={2} look="display-l" id="gallery-no-match-heading" className="text-pretty">
            {uk.noMatch.heading}
          </Heading>
          <Text look="body" className="text-ink-2 text-pretty">
            {uk.noMatch.reassurance}
          </Text>
          {regionEmpty && (
            <Text
              look="body"
              className="text-ink-2 text-pretty"
              data-testid="no-match-region-empty"
            >
              {uk.noMatch.regionEmpty}
            </Text>
          )}
        </div>

        {neighbourRegions.length > 0 && (
          <div className="flex w-full flex-col gap-2">
            {neighbourRegions.map((neighbour) => (
              <LinkButton
                key={neighbour.id}
                variant="secondary"
                href={galleryHref(
                  { ...filters, regions: { kind: "oneOf", values: [neighbour.id] }, cities: ANY },
                  sort,
                  citySlugs,
                )}
                data-testid="no-match-neighbour-region"
                className="w-full"
              >
                {fillTemplate(uk.noMatch.neighbourRegion, {
                  region: neighbour.label,
                  animalWord: fillTemplate(uk.noMatch.additionalAnimals, {
                    count: String(neighbour.count),
                    animalWord: pluralizeUk(neighbour.count, uk.filters.animalWord),
                  }),
                })}
              </LinkButton>
            ))}
          </div>
        )}

        {relaxations.length > 0 && (
          <>
            <div className="flex w-full flex-col gap-2">
              {relaxations.map((suggestion, index) => (
                <LinkButton
                  key={suggestion.dimension}
                  variant={index === 0 ? "primary" : "secondary"}
                  href={galleryHref(relaxDimension(filters, suggestion.dimension), sort, citySlugs)}
                  data-testid="no-match-suggestion"
                  className="w-full"
                >
                  {suggestionLabel(suggestion)}
                </LinkButton>
              ))}
            </div>
            <Text look="hint" className="text-pretty">
              {uk.noMatch.suggestionExplainer}
            </Text>
          </>
        )}
      </div>
    </Panel>
  );
}
