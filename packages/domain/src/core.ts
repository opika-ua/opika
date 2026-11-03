/**
 * The zod-free part of the domain; schemas live in the main entry and derive from the tuples here.
 *
 * Exists because a client file that imports the main entry for one constant pulls zod and every
 * schema built at module init into the browser bundle. Nothing here may import zod or the main
 * entry (only erased `import type` and zod-free siblings); a guard test in `apps/web` pins it.
 */

import type { RegionId } from "./geography/region";
import type { CityId } from "./primitives/ids";

export * from "./geography/place-search";
export * from "./geography/transliterate";
export * from "./primitives/plural";

export const ANIMAL_SPECIES = ["dog", "cat"] as const;
export type AnimalSpecies = (typeof ANIMAL_SPECIES)[number];

/**
 * A closed universe, like `ANIMAL_SPECIES` - "unknown" is a real, stored value (the never-null
 * default), not an absence. The sex filter can therefore collapse "every option ticked" to "any"
 * the same way species/size/age do (`canonicalizeFilters`).
 */
export const ANIMAL_SEXES = ["male", "female", "unknown"] as const;
export type AnimalSex = (typeof ANIMAL_SEXES)[number];

/** Ordered youngest to oldest. The order is load-bearing for range queries. */
export const AGE_BUCKETS = ["baby", "young", "adult", "senior"] as const;
export type AgeBucket = (typeof AGE_BUCKETS)[number];

export const SIZE_BUCKETS = ["small", "medium", "large"] as const;
export type SizeBucket = (typeof SIZE_BUCKETS)[number];

/**
 * How a browsable list of animals is ordered. Deliberately closed at two, and without a "best
 * match" mode: the order is stated, understandable and reproducible from a shared URL.
 */
export const GALLERY_SORTS = ["freshest", "longest_waiting"] as const;
export type GallerySort = (typeof GALLERY_SORTS)[number];

/**
 * Freshest first: what someone arriving with no stated preference means by "show me the
 * animals", and the only ordering that surfaces a listing a shelter has just tended to.
 */
export const DEFAULT_GALLERY_SORT: GallerySort = "freshest";

export const LOCALES = ["uk", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/** BCP 47 tags, used when calling `Intl`. */
export const INTL_LOCALE: Record<Locale, string> = {
  uk: "uk-UA",
  en: "en-GB",
};

/**
 * The bound on how many matching rows the gallery will page through.
 *
 * Not a database guard - `OFFSET` over a few thousand rows via an index Postgres already holds
 * for the ordering costs nothing, and would still cost nothing at ten times this. It is an
 * admission that at ~83 pages numbered pagination has stopped being a way anyone browses
 * anything, and that the answer past this depth is a narrower filter, not a higher ceiling.
 * Written down so the number is not later raised on a performance argument that was never the
 * reason it exists.
 */
export const MAX_GALLERY_NAVIGABLE_ROWS = 2000;

/**
 * An explicit "any" instead of an empty array.
 *
 * With a plain list, `[]` has to mean either "no constraint" or "match nothing". The codebase
 * picks one by convention, and eventually somewhere picks the other - a filter sheet that renders
 * an empty feed, or one that ignores the filter entirely. Neither is a failure a type should
 * permit, and the non-empty tuple makes an empty selection unconstructable.
 */
export type FilterSelection<T> = { kind: "any" } | { kind: "oneOf"; values: readonly [T, ...T[]] };

export type FeedFilters = {
  regions: FilterSelection<RegionId>;
  cities: FilterSelection<CityId>;
  species: FilterSelection<AnimalSpecies>;
  sizes: FilterSelection<SizeBucket>;
  ages: FilterSelection<AgeBucket>;
  sexes: FilterSelection<AnimalSex>;
};

/**
 * Bounds for the two location dimensions, which have no closed universe: there are 27 oblasts, and
 * the URL reads at most 30 city tokens. Without them a request could repeat the list thousands of
 * times and, since the facet scan repeats the predicate per option, approach Postgres's
 * 65,535-parameter limit.
 */
export const MAX_FILTER_REGIONS = 27;
export const MAX_FILTER_CITIES = 30;

export const ANY: FilterSelection<never> = { kind: "any" };

export const NO_FILTERS: FeedFilters = {
  regions: { kind: "any" },
  cities: { kind: "any" },
  species: { kind: "any" },
  sizes: { kind: "any" },
  ages: { kind: "any" },
  sexes: { kind: "any" },
};

/**
 * The dimensions a filter set constrains, as data rather than as hand-written string literals.
 * `FeedFilterDimension` is `keyof FeedFilters`, and the check below fails to compile when a
 * dimension is added to the type but not here, so a relaxation suggestion, a URL parameter or a
 * count query cannot silently cover only the earlier ones.
 */
export const FEED_FILTER_DIMENSIONS = [
  "regions",
  "cities",
  "species",
  "sizes",
  "ages",
  "sexes",
] as const;
export type FeedFilterDimension = keyof FeedFilters;
const _everyDimensionIsListed: Exclude<
  FeedFilterDimension,
  (typeof FEED_FILTER_DIMENSIONS)[number]
> extends never
  ? true
  : never = true;
void _everyDimensionIsListed;

export const isConstrained = (filters: FeedFilters, dimension: FeedFilterDimension): boolean =>
  filters[dimension].kind !== "any";

/**
 * The same filter set with one dimension dropped.
 *
 * Exists so "how many more animals would you see if you stopped filtering by size" is answered by
 * the *same* predicate builder the real query uses, over a relaxed filter set - rather than by a
 * second, parallel predicate builder that omits one clause and can drift from the first.
 */
export const relaxDimension = (
  filters: FeedFilters,
  dimension: FeedFilterDimension,
): FeedFilters => ({ ...filters, [dimension]: ANY });

export const matchesSelection = <T>(selection: FilterSelection<T>, value: T): boolean =>
  selection.kind === "any" || selection.values.includes(value);

/**
 * Whether `value` was explicitly chosen - never true for `{kind: "any"}`, unlike
 * `matchesSelection`, which deliberately treats "any" as matching everything (the right behaviour
 * for *filtering*: an unconstrained dimension excludes nothing). A filter-UI checkbox or chip
 * asking "should I render as checked" wants this function instead: reusing `matchesSelection`
 * there marks every single option active the moment nothing is filtered.
 */
export const isExplicitlySelected = <T>(selection: FilterSelection<T>, value: T): boolean =>
  selection.kind === "oneOf" && selection.values.includes(value);

/**
 * `universe` collapses an exhaustive selection back to "any".
 *
 * Without it, ticking every species box yields `{oneOf:["cat","dog"]}` while leaving the filter
 * alone yields `{any}` - two encodings of the same question, which is exactly the cursor mismatch
 * this function exists to prevent. Sorting alone does not catch it.
 *
 * Cities and regions have no universe here, so they are ordered but never collapsed; the lists
 * are data and do not belong in this package.
 */
const canonicalizeSelection = <T extends string>(
  selection: FilterSelection<T>,
  universe: readonly T[] | null,
): FilterSelection<T> => {
  if (selection.kind === "any") return selection;

  const unique = [...new Set(selection.values)].sort();
  const [first, ...rest] = unique;
  // Unreachable through the schema, which forbids an empty selection. Reaching it means a
  // hand-built object, and widening to "any" there would silently show every animal - the
  // opposite of what an empty selection suggests. Say so instead of guessing.
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
 * Two filter sets that mean the same thing must serialise identically, or a keyset cursor issued
 * against one stops matching the other and the feed silently restarts. Also what makes filter
 * state shareable in a URL.
 *
 * Every dimension here is a closed universe over a field that is never null, so each collapses on
 * its own universe exactly as `species`/`sizes`/`ages` do.
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
 * A cursor is only valid for the filters it was issued against - page 2 of an unfiltered feed
 * means nothing once a city is selected. Embedding this in the cursor payload turns "cursor
 * reused across a filter change" from a silently wrong page into a rejected one. Doubles as the
 * URL state key.
 *
 * A fingerprint with a different segment count than the one a cursor was issued against is
 * refused outright rather than read against the wrong filters (the dimensions have been added and
 * removed over time). Defense in depth alongside the cursor's own `kind` tag and HMAC signature,
 * not a standalone proof: segment count is not monotonic, so a coincidental collision is
 * implausible (the dimensions' value vocabularies do not overlap), not impossible by construction.
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

/**
 * Zod 4's `z.uuid()` pattern, copied so the pure parsers below accept exactly the ids the schemas
 * do (the parity test in `core.test.ts` holds the two together).
 */
const UUID_PATTERN =
  /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;

// The casts below are the whole point of a parser: the brand is type-only and this is where the
// check that earns it happens.
export const parseCityId = (value: unknown): CityId | null =>
  typeof value === "string" && UUID_PATTERN.test(value) ? (value as CityId) : null;

export const parseRegionId = (value: unknown): RegionId | null =>
  typeof value === "string" && UUID_PATTERN.test(value) ? (value as RegionId) : null;

/** The member of `values` that `value` equals, or null. */
export const parseEnum = <const V extends readonly string[]>(
  values: V,
  value: unknown,
): V[number] | null =>
  typeof value === "string" && (values as readonly string[]).includes(value)
    ? (value as V[number])
    : null;

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseSelection = <T>(
  raw: unknown,
  parseValue: (value: unknown) => T | null,
  maxValues: number | null,
): FilterSelection<T> | null => {
  if (!isPlainRecord(raw)) return null;
  if (raw.kind === "any") return { kind: "any" };
  if (raw.kind !== "oneOf") return null;

  const { values } = raw;
  if (!Array.isArray(values) || values.length === 0) return null;
  if (maxValues !== null && values.length > maxValues) return null;

  const parsed: T[] = [];
  for (const value of values) {
    const item = parseValue(value);
    if (item === null) return null;
    parsed.push(item);
  }
  const [first, ...rest] = parsed;
  return first === undefined ? null : { kind: "oneOf", values: [first, ...rest] };
};

/**
 * `FeedFiltersSchema.safeParse` without zod, for the client: the stored filter set in
 * `sessionStorage` is untrusted input, and the schema pulls the whole domain into the bundle. A
 * saved set from before the oblast or sex dimension existed still parses, as "no filter" for it,
 * and anything else malformed is null. The parity test pins that both give the same answer.
 */
export const parseFeedFilters = (raw: unknown): FeedFilters | null => {
  if (!isPlainRecord(raw)) return null;

  const regions =
    raw.regions === undefined
      ? ({ kind: "any" } as const)
      : parseSelection(raw.regions, parseRegionId, MAX_FILTER_REGIONS);
  const sexes =
    raw.sexes === undefined
      ? ({ kind: "any" } as const)
      : parseSelection(raw.sexes, (value) => parseEnum(ANIMAL_SEXES, value), null);
  const cities = parseSelection(raw.cities, parseCityId, MAX_FILTER_CITIES);
  const species = parseSelection(raw.species, (value) => parseEnum(ANIMAL_SPECIES, value), null);
  const sizes = parseSelection(raw.sizes, (value) => parseEnum(SIZE_BUCKETS, value), null);
  const ages = parseSelection(raw.ages, (value) => parseEnum(AGE_BUCKETS, value), null);

  if (
    regions === null ||
    cities === null ||
    species === null ||
    sizes === null ||
    ages === null ||
    sexes === null
  ) {
    return null;
  }
  return { regions, cities, species, sizes, ages, sexes };
};

/** Every channel a shelter can be reached on, the primary first. */
export const allChannels = <C>(contact: {
  readonly primary: C;
  readonly additional: readonly C[];
}): readonly C[] => [contact.primary, ...contact.additional];

/**
 * The sign-and-unit contract for relative time, in one place.
 *
 * `Intl.RelativeTimeFormat` produces correct Ukrainian plurals for free, but only when called with
 * a negative offset and the "day" unit - which is the mistake worth a test, rather than whether
 * the platform's plural rules work. Keeping the call here means every surface cannot re-derive the
 * sign wrongly. Locale is a parameter, so nothing about a language or a product is baked in.
 */
export const formatFreshnessRelative = (
  freshness: { readonly ageDays: number },
  locale: Locale,
): string =>
  new Intl.RelativeTimeFormat(INTL_LOCALE[locale], { numeric: "auto" }).format(
    -freshness.ageDays,
    "day",
  );

/**
 * The grammatical gender a word describing an animal takes (K3-F1: sex-aware age words on the
 * card). A female animal takes the feminine; a male one, and one whose sex is «Не записано», keep
 * the generic masculine the card has always used: picking a gender for an unknown sex would state
 * something nobody recorded.
 */
export type GrammaticalGender = "masculine" | "feminine";

export const grammaticalGenderOf = (sex: AnimalSex): GrammaticalGender => {
  switch (sex) {
    case "female":
      return "feminine";
    case "male":
    case "unknown":
      return "masculine";
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled sex; unreachable at runtime */
    default: {
      const unreachable: never = sex;
      return unreachable;
    }
  }
};
