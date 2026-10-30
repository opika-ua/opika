import type { GalleryFacetCounts } from "@opika/contracts";
import type { FeedFilters, FilterSelection } from "@opika/domain";

/**
 * What «Показати …» would show for choices not yet applied, from the facet counts the page already
 * holds. Each animal sits in exactly one option of a dimension (one age, one size, one sex, one
 * city, one oblast), and a dimension's counts are taken with every OTHER filter applied, so the sum
 * of the chosen options is the exact result when only that one dimension differs from the applied
 * filters. With two or more dimensions changed the counts no longer apply to each other and the
 * answer is `null`: the caller must not show a number it cannot stand behind.
 */
const DIMENSIONS = ["regions", "cities", "ages", "sizes", "sexes"] as const;
type Dimension = (typeof DIMENSIONS)[number];

const valuesOf = (selection: FilterSelection<string>): readonly string[] =>
  selection.kind === "oneOf" ? selection.values : [];

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((value) => b.includes(value));

/** Every option of the dimension with its count, whether chosen or not. */
function optionCounts(dimension: Dimension, counts: GalleryFacetCounts): Map<string, number> {
  switch (dimension) {
    case "regions":
      return new Map(counts.regions.map((entry) => [entry.regionId as string, entry.count]));
    case "cities":
      return new Map(counts.cities.map((entry) => [entry.cityId as string, entry.count]));
    case "ages":
      return new Map(Object.entries(counts.ages));
    case "sizes":
      return new Map(Object.entries(counts.sizes));
    case "sexes":
      return new Map(Object.entries(counts.sexes));
  }
}

export function liveResultCount(
  applied: FeedFilters,
  live: FeedFilters,
  counts: GalleryFacetCounts,
  appliedCount: number,
): number | null {
  const changed = DIMENSIONS.filter(
    (dimension) => !sameSet(valuesOf(applied[dimension]), valuesOf(live[dimension])),
  );
  if (changed.length === 0) return appliedCount;
  const [only] = changed;
  if (changed.length > 1 || only === undefined) return null;
  const options = optionCounts(only, counts);
  const chosen = valuesOf(live[only]);
  const wanted = chosen.length === 0 ? [...options.keys()] : chosen;
  return wanted.reduce((sum, value) => sum + (options.get(value) ?? 0), 0);
}
