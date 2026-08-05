import { z } from "zod";
import { AgeBucketSchema } from "../animals/age.js";
import { AnimalSpeciesSchema } from "../animals/animal.js";
import { SizeBucketSchema } from "../animals/size.js";
import { CityIdSchema } from "../primitives/ids.js";

/**
 * An explicit "any" instead of an empty array.
 *
 * With a plain list, `[]` has to mean either "no constraint" or "match
 * nothing". The codebase picks one by convention, and eventually somewhere
 * picks the other — a filter sheet that renders an empty feed, or one that
 * ignores the filter entirely. Neither is a failure a type should permit, and
 * the non-empty tuple makes an empty selection unconstructable.
 */
export type FilterSelection<T> = { kind: "any" } | { kind: "oneOf"; values: readonly [T, ...T[]] };

/**
 * A variadic tuple rather than `z.array(...).nonempty()`.
 *
 * Zod 4's `.nonempty()` enforces the constraint at runtime but infers a plain
 * array, so the emptiness the union is designed to exclude would come back at
 * the type level. `z.tuple([value], value)` keeps both halves of the guarantee.
 */
const filterSelectionSchema = <S extends z.ZodType>(value: S) =>
  z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("any") }),
    z.object({
      kind: z.literal("oneOf"),
      values: z.tuple([value], value).readonly(),
    }),
  ]);

export const ANY: FilterSelection<never> = { kind: "any" };

export const FeedFiltersSchema = z.object({
  cities: filterSelectionSchema(CityIdSchema),
  species: filterSelectionSchema(AnimalSpeciesSchema),
  sizes: filterSelectionSchema(SizeBucketSchema),
  ages: filterSelectionSchema(AgeBucketSchema),
});
export type FeedFilters = z.infer<typeof FeedFiltersSchema>;

export const NO_FILTERS: FeedFilters = {
  cities: { kind: "any" },
  species: { kind: "any" },
  sizes: { kind: "any" },
  ages: { kind: "any" },
};

export const matchesSelection = <T>(selection: FilterSelection<T>, value: T): boolean =>
  selection.kind === "any" || selection.values.includes(value);

const canonicalizeSelection = <T extends string>(
  selection: FilterSelection<T>,
): FilterSelection<T> => {
  if (selection.kind === "any") return selection;

  const unique = [...new Set(selection.values)].sort();
  const [first, ...rest] = unique;
  if (first === undefined) return { kind: "any" };
  return { kind: "oneOf", values: [first, ...rest] };
};

/**
 * Two filter sets that mean the same thing must serialise identically, or a
 * keyset cursor issued against one stops matching the other and the feed
 * silently restarts. Also what makes filter state shareable in a URL.
 */
export const canonicalizeFilters = (filters: FeedFilters): FeedFilters => ({
  cities: canonicalizeSelection(filters.cities),
  species: canonicalizeSelection(filters.species),
  sizes: canonicalizeSelection(filters.sizes),
  ages: canonicalizeSelection(filters.ages),
});

export const isUnfiltered = (filters: FeedFilters): boolean =>
  filters.cities.kind === "any" &&
  filters.species.kind === "any" &&
  filters.sizes.kind === "any" &&
  filters.ages.kind === "any";
