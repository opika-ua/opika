import { z } from "zod";
import { AgeBucketSchema } from "../animals/age";
import { AnimalSexSchema, AnimalSpeciesSchema } from "../animals/animal";
import { SizeBucketSchema } from "../animals/size";
import {
  FEED_FILTER_DIMENSIONS,
  type FeedFilters,
  MAX_FILTER_CITIES,
  MAX_FILTER_REGIONS,
} from "../core";
import { RegionIdSchema } from "../geography/region";
import { CityIdSchema } from "../primitives/ids";

// The types, constants and pure functions live in `../core` (no zod, so a client file can use
// them); this file keeps the schema, derived from the same vocabulary. Re-exported so the
// package's paths are unchanged.
export {
  ANY,
  canonicalizeFilters,
  FEED_FILTER_DIMENSIONS,
  type FeedFilterDimension,
  type FeedFilters,
  type FilterSelection,
  filtersFingerprint,
  isConstrained,
  isExplicitlySelected,
  MAX_FILTER_CITIES,
  MAX_FILTER_REGIONS,
  matchesSelection,
  NO_FILTERS,
  relaxDimension,
} from "../core";

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

// The hand-written `FeedFilters` in `../core` must stay the shape this schema parses to.
type SameType<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const _schemaMatchesType: SameType<z.infer<typeof FeedFiltersSchema>, FeedFilters> = true;
void _schemaMatchesType;

export const FeedFilterDimensionSchema = z.enum(FEED_FILTER_DIMENSIONS);
