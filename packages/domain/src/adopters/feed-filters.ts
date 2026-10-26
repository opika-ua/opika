import { z } from "zod";
import { AGE_BUCKETS, AgeBucketSchema } from "../animals/age";
import { ANIMAL_SPECIES, AnimalSpeciesSchema } from "../animals/animal";
import { COAT_LENGTHS, CoatLengthSchema } from "../animals/coat";
import { COAT_COLOURS, CoatColourSchema } from "../animals/colour";
import { SIZE_BUCKETS, SizeBucketSchema } from "../animals/size";
import { TEMPERAMENT_TRAITS, TemperamentTraitSchema } from "../animals/temperament";
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
  /**
   * Defaults to "any" when absent, so a filter set written before the fifth
   * dimension existed (a tab's `sessionStorage`, a request from a page loaded
   * before the deploy) still parses, as "no fur filter", which is what it
   * meant. Its cursor still answers `INVALID_CURSOR`: the fingerprint gained a
   * segment, so no earlier fingerprint can equal a current one.
   */
  coatLengths: filterSelectionSchema(CoatLengthSchema).default({ kind: "any" }),
  /**
   * The pet card's two filterable fields, defaulted for the reason fur is: a
   * filter set from before they existed still parses, as "no temperament or
   * colour filter", and its cursor answers `INVALID_CURSOR` once.
   *
   * A temperament filter matches an animal that has *any* of the chosen
   * traits, not all of them: ticking «Грайливі» and «Спокійні» widens the
   * list, as every other multi-select here does. Only the presets are
   * filterable; a custom entry or a custom colour is the shelter's own words,
   * which no filter can enumerate.
   */
  temperaments: filterSelectionSchema(TemperamentTraitSchema).default({ kind: "any" }),
  colours: filterSelectionSchema(CoatColourSchema).default({ kind: "any" }),
});
export type FeedFilters = z.infer<typeof FeedFiltersSchema>;

export const NO_FILTERS: FeedFilters = {
  cities: { kind: "any" },
  species: { kind: "any" },
  sizes: { kind: "any" },
  ages: { kind: "any" },
  coatLengths: { kind: "any" },
  temperaments: { kind: "any" },
  colours: { kind: "any" },
};

/**
 * The dimensions a filter set constrains, as data rather than as
 * hand-written string literals.
 *
 * `FeedFiltersSchema.keyof()` derives this from the schema itself, so adding a
 * dimension (fur was the fifth, temperament and colour the sixth and seventh)
 * cannot leave a relaxation suggestion, a URL parameter or a count query
 * silently covering only the earlier ones.
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
 * Cities have no static universe, so they are ordered but never collapsed; the
 * city list is data and does not belong in this package.
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
 * Fur, temperament and colour can be unrecorded, so for them "every box
 * ticked" and "no filter" differ by one group: the animals with nothing
 * recorded, which only "no filter" admits. They collapse anyway, as fur
 * already did. A person who ticks every option is asking for everything the
 * filter offers, not for "only animals whose shelter described them", and two
 * encodings of that one request would be the cursor mismatch above.
 */
export const canonicalizeFilters = (filters: FeedFilters): FeedFilters => ({
  cities: canonicalizeSelection(filters.cities, null),
  species: canonicalizeSelection(filters.species, ANIMAL_SPECIES),
  sizes: canonicalizeSelection(filters.sizes, SIZE_BUCKETS),
  ages: canonicalizeSelection(filters.ages, AGE_BUCKETS),
  coatLengths: canonicalizeSelection(filters.coatLengths, COAT_LENGTHS),
  temperaments: canonicalizeSelection(filters.temperaments, TEMPERAMENT_TRAITS),
  colours: canonicalizeSelection(filters.colours, COAT_COLOURS),
});

/**
 * A stable identity for a filter set.
 *
 * A cursor is only valid for the filters it was issued against - page 2 of an
 * unfiltered feed means nothing once a city is selected. Embedding this in the
 * cursor payload turns "cursor reused across a filter change" from a silently
 * wrong page into a rejected one. Doubles as the URL state key.
 *
 * A new dimension appends its segment, never inserts one: an older
 * fingerprint then has fewer segments than any current one, so it can never
 * equal one, and a cursor issued before the dimension existed is refused
 * once rather than read against the wrong filters.
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
    encode(canonical.coatLengths),
    encode(canonical.temperaments),
    encode(canonical.colours),
  ].join("|");
};
