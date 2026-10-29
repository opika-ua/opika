import { z } from "zod";
import { AGE_BUCKETS, AgeBucketSchema } from "../animals/age";
import {
  ANIMAL_SEXES,
  ANIMAL_SPECIES,
  AnimalSexSchema,
  AnimalSpeciesSchema,
} from "../animals/animal";
import { SIZE_BUCKETS, SizeBucketSchema } from "../animals/size";
import { RegionIdSchema } from "../geography/region";
import { CityIdSchema } from "../primitives/ids";

/**
 * An explicit "any" instead of an empty array.
 *
 * With a plain list, `[]` has to mean either "no constraint" or "match
 * nothing". The codebase picks one by convention, and eventually somewhere
 * picks the other - a filter sheet that renders an empty feed, or one that
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
const filterSelectionSchema = <S extends z.ZodType>(value: S, maxValues?: number) =>
  z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("any") }),
    z.object({
      kind: z.literal("oneOf"),
      values:
        maxValues === undefined
          ? z.tuple([value], value).readonly()
          : z
              .tuple([value], value)
              .readonly()
              .refine((values) => (values as readonly unknown[]).length <= maxValues, {
                message: `at most ${maxValues} values`,
              }),
    }),
  ]);

/**
 * Bounds for the two location dimensions, which have no closed universe: there are 27 oblasts, and
 * the URL reads at most 30 city tokens. Without them a request could repeat the list thousands of
 * times and, since the facet scan repeats the predicate per option, approach Postgres's
 * 65,535-parameter limit.
 */
export const MAX_FILTER_REGIONS = 27;
export const MAX_FILTER_CITIES = 30;

export const ANY: FilterSelection<never> = { kind: "any" };

export const FeedFiltersSchema = z.object({
  /**
   * Defaulted so a saved filter set from before the oblast dimension still parses, as "no oblast
   * filter". Semantics with `cities` are a union of scopes (`buildFilterPredicate`): an oblast
   * means all of its cities unless some of its cities are also picked, in which case only those.
   */
  regions: filterSelectionSchema(RegionIdSchema, MAX_FILTER_REGIONS).default({ kind: "any" }),
  cities: filterSelectionSchema(CityIdSchema, MAX_FILTER_CITIES),
  species: filterSelectionSchema(AnimalSpeciesSchema),
  sizes: filterSelectionSchema(SizeBucketSchema),
  ages: filterSelectionSchema(AgeBucketSchema),
  /**
   * Defaulted so a filter set saved before this dimension existed still
   * parses, as "no sex filter". `sex` is never null on `Animal` - "unknown"
   * is a real, explicit value (`ANIMAL_SEXES`) - so this collapses to "any"
   * the same way `species`/`sizes`/`ages` do.
   */
  sexes: filterSelectionSchema(AnimalSexSchema).default({ kind: "any" }),
});
export type FeedFilters = z.infer<typeof FeedFiltersSchema>;

export const NO_FILTERS: FeedFilters = {
  regions: { kind: "any" },
  cities: { kind: "any" },
  species: { kind: "any" },
  sizes: { kind: "any" },
  ages: { kind: "any" },
  sexes: { kind: "any" },
};

/**
 * The dimensions a filter set constrains, as data rather than as
 * hand-written string literals.
 *
 * `FeedFiltersSchema.keyof()` derives this from the schema itself, so adding
 * a dimension cannot leave a relaxation suggestion, a URL parameter or a
 * count query silently covering only the earlier ones.
 */
export const FeedFilterDimensionSchema = FeedFiltersSchema.keyof();
export type FeedFilterDimension = z.infer<typeof FeedFilterDimensionSchema>;

export const FEED_FILTER_DIMENSIONS = FeedFilterDimensionSchema.options;

export const isConstrained = (filters: FeedFilters, dimension: FeedFilterDimension): boolean =>
  filters[dimension].kind !== "any";

/**
 * The same filter set with one dimension dropped.
 *
 * Exists so "how many more animals would you see if you stopped filtering by
 * size" is answered by the *same* predicate builder the real query uses, over a
 * relaxed filter set - rather than by a second, parallel predicate builder that
 * omits one clause and can drift from the first.
 */
export const relaxDimension = (
  filters: FeedFilters,
  dimension: FeedFilterDimension,
): FeedFilters => ({ ...filters, [dimension]: ANY });

export const matchesSelection = <T>(selection: FilterSelection<T>, value: T): boolean =>
  selection.kind === "any" || selection.values.includes(value);

/**
 * Whether `value` was explicitly chosen - never true for `{kind: "any"}`,
 * unlike `matchesSelection`, which deliberately treats "any" as matching
 * everything (the right behaviour for *filtering*: an unconstrained
 * dimension excludes nothing). A filter-UI checkbox or chip asking "should
 * I render as checked" wants this function instead: reusing
 * `matchesSelection` there marks every single option active the moment
 * nothing is filtered, which is a real bug, not a cosmetic one - a filter
 * sheet whose "select all" state is indistinguishable from "nothing
 * selected" cannot show the adopter what they actually chose.
 */
export const isExplicitlySelected = <T>(selection: FilterSelection<T>, value: T): boolean =>
  selection.kind === "oneOf" && selection.values.includes(value);

/**
 * `universe` collapses an exhaustive selection back to "any".
 *
 * Without it, ticking every species box yields `{oneOf:["cat","dog"]}` while
 * leaving the filter alone yields `{any}` - two encodings of the same question,
 * which is exactly the cursor mismatch this function exists to prevent. Sorting
 * alone does not catch it.
 *
 * Cities and regions have no universe here, so they are ordered but never collapsed; the
 * lists are data and do not belong in this package.
 */
const canonicalizeSelection = <T extends string>(
  selection: FilterSelection<T>,
  universe: readonly T[] | null,
): FilterSelection<T> => {
  if (selection.kind === "any") return selection;

  const unique = [...new Set(selection.values)].sort();
  const [first, ...rest] = unique;
  // Unreachable through the schema, which forbids an empty selection. Reaching
  // it means a hand-built object, and widening to "any" there would silently
  // show every animal - the opposite of what an empty selection suggests. Say
  // so instead of guessing.
  if (first === undefined) {
    throw new Error("A oneOf filter selection must contain at least one value.");
  }

  const coversEverything = universe?.every((value) => unique.includes(value)) ?? false;
  if (coversEverything) {
    return { kind: "any" };
  }

  return { kind: "oneOf", values: [first, ...rest] };
};

/**
 * Two filter sets that mean the same thing must serialise identically, or a
 * keyset cursor issued against one stops matching the other and the feed
 * silently restarts. Also what makes filter state shareable in a URL.
 *
 * Every dimension here is a closed universe over a field that is never null,
 * so each collapses on its own universe exactly as `species`/`sizes`/`ages`
 * do.
 */
export const canonicalizeFilters = (filters: FeedFilters): FeedFilters => ({
  regions: canonicalizeSelection(filters.regions, null),
  cities: canonicalizeSelection(filters.cities, null),
  species: canonicalizeSelection(filters.species, ANIMAL_SPECIES),
  sizes: canonicalizeSelection(filters.sizes, SIZE_BUCKETS),
  ages: canonicalizeSelection(filters.ages, AGE_BUCKETS),
  sexes: canonicalizeSelection(filters.sexes, ANIMAL_SEXES),
});

/**
 * A stable identity for a filter set.
 *
 * A cursor is only valid for the filters it was issued against - page 2 of an
 * unfiltered feed means nothing once a city is selected. Embedding this in the
 * cursor payload turns "cursor reused across a filter change" from a silently
 * wrong page into a rejected one. Doubles as the URL state key.
 *
 * This PR drops three dimensions (coatLengths, temperaments, colours), so
 * every fingerprint built today has fewer segments than any issued before
 * it - a cursor from before this change is refused outright rather than
 * read against the wrong filters. That is a property of this one
 * transition, not a standing guarantee: once dimensions can be both added
 * and removed over time, segment count is no longer monotonic, and a
 * future schema change could coincidentally land on a count some past era
 * also used. Even then, a literal string match additionally requires every
 * encoded value to match position-for-position, and the dimensions' own
 * value vocabularies don't overlap (a city id never looks like a size
 * bucket), so an accidental full collision stays implausible rather than
 * impossible by construction. Treat this as defense in depth alongside the
 * cursor's own `kind` tag and HMAC signature, not as a standalone proof.
 */
export const filtersFingerprint = (filters: FeedFilters): string => {
  const canonical = canonicalizeFilters(filters);
  const encode = (selection: FilterSelection<string>): string =>
    selection.kind === "any" ? "*" : selection.values.join(",");

  return [
    encode(canonical.cities),
    encode(canonical.species),
    encode(canonical.sizes),
    encode(canonical.ages),
    encode(canonical.sexes),
    // Appended last: every fingerprint issued before the oblast dimension has one segment fewer,
    // so a cursor from before it is refused once (INVALID_CURSOR), never read against the wrong filters.
    encode(canonical.regions),
  ].join("|");
};
