import {
  MAX_CITY_TOKEN_LENGTH,
  MAX_CITY_TOKENS,
  MAX_GALLERY_PAGE,
} from "@opika/contracts/constants";
import type { AnimalId, CityId, RegionId } from "@opika/domain";
import {
  AGE_BUCKETS,
  type AgeBucket,
  ANIMAL_SEXES,
  ANIMAL_SPECIES,
  ANY,
  type AnimalSex,
  type AnimalSpecies,
  canonicalizeFilters,
  DEFAULT_GALLERY_SORT,
  type FeedFilters,
  type FilterSelection,
  GALLERY_SORTS,
  type GallerySort,
  isExplicitlySelected,
  NO_FILTERS,
  parseCityId,
  parseEnum,
  SIZE_BUCKETS,
  type SizeBucket,
} from "@opika/domain/core";
import { fillTemplate, ukPublic as uk } from "@opika/i18n/public";
import type { CityTokenResolution } from "./city-tokens";

/**
 * The design's own URL example (`/tvaryny?misto=brovary&stor=1`,
 * docs/design/README.md) is now literal: `misto`'s value is
 * a city's `slug` (`docs/observations.md` O-6), not the raw `CityId` this
 * file used before the slug field existed. `vyd`/`rozmir`/`vik`
 * (species/size/age) are new - the design specifies the filter *groups*
 * (МІСТО/ВИД/РОЗМІР/ВІК) but never their query-param names, so these follow
 * `misto`/`stor`'s transliteration convention.
 *
 * Every function below that reads or writes the city param needs a lookup
 * between `CityId` (what `FeedFilters` and every domain/contract type carry)
 * and `CitySlug` (what the URL carries) - cities are seed/admin data, not
 * something these pure functions can fetch themselves, so the lookup always
 * arrives as a parameter built once by the caller (`place-book.ts`, from the labels the page holds).
 *
 * `stat` (sex) follows the same transliteration convention for «Стать» -
 * «ь» drops, the way a final «я» becomes `ia`.
 *
 * `sherst`/`kharakter`/`zabarvlennia` (fur, temperament, colour) existed
 * here too, through the pet card redesign; removed with those three
 * dimensions by the gallery filter restructure, which found them harder to
 * use well than to use at all. A stale link carrying one of them degrades
 * the same way an unrecognised param always has - `parseGalleryQuery`
 * drops anything it doesn't recognise, so an old `?sherst=long` link still
 * opens the gallery, just without that constraint.
 */
const CITY_PARAM = "misto";
const REGION_PARAM = "obl";
const SPECIES_PARAM = "vyd";
const SIZE_PARAM = "rozmir";
const AGE_PARAM = "vik";
const SEX_PARAM = "stat";
const SORT_PARAM = "sort";
const PAGE_PARAM = "stor";

/**
 * The same eight names, exported for the one caller that cannot go through
 * `galleryHref`: `FilterSheet`'s `<form method="GET">`, whose field `name`
 * attributes ARE the query keys the browser submits with no JS running.
 * Spelling them as literals there would be a second, uncompiled copy of
 * this file's scheme - the drift `parseGalleryQuery` could not detect,
 * because a renamed param and a stale `name=` both parse to "that
 * constraint didn't apply."
 */
export const GALLERY_PARAM = {
  region: REGION_PARAM,
  city: CITY_PARAM,
  species: SPECIES_PARAM,
  size: SIZE_PARAM,
  age: AGE_PARAM,
  sex: SEX_PARAM,
  sort: SORT_PARAM,
  page: PAGE_PARAM,
} as const;

export type SearchParams = Record<string, string | string[] | undefined>;

export type GalleryQuery = {
  filters: FeedFilters;
  sort: GallerySort;
  page: number;
};

const firstValue = (raw: string | string[] | undefined): string | undefined =>
  Array.isArray(raw) ? raw[0] : raw;

/**
 * A multi-select dimension arrives in two different shapes depending on
 * which UI produced the URL, and both have to parse to the same result:
 * the rail writes one comma-joined param (`?vyd=dog,cat`, `galleryHref`),
 * but the sheet is a real `<form method="GET">` with several same-`name`
 * checkboxes, and a native browser submission of two checked boxes named
 * `vyd` produces a *repeated* param (`?vyd=dog&vyd=cat`) - an array here,
 * never a comma inside one string. Reducing to `firstValue` (as every
 * other, single-value param in this file does) would silently keep only
 * the first checked box on every native sheet submission, which is
 * exactly the shape of bug this file's tests exist to catch: it works
 * perfectly with the rail and loses data with the sheet, invisibly.
 */
const tokensOf = (raw: string | string[] | undefined): string[] =>
  (Array.isArray(raw) ? raw : (raw?.split(",") ?? [])).flatMap((entry) => entry.split(","));

function parseSelection<T extends string>(
  raw: string | string[] | undefined,
  universe: readonly T[],
): FilterSelection<T> {
  const values = [
    ...new Set(
      tokensOf(raw)
        .map((token) => parseEnum(universe, token))
        .filter((value): value is T => value !== null),
    ),
  ];

  const [first, ...rest] = values;
  if (first === undefined) return ANY;
  return { kind: "oneOf", values: [first, ...rest] };
}

/**
 * The contract rejects a page above `MAX_GALLERY_PAGE` (and any non-safe integer such as `1e21`), and
 * a rejected input is a 500. So a valid but absurd page number clamps to that ceiling, where the repo
 * then clamps to the real last page, exactly as `?stor=500` already does. Anything that is not a whole
 * number of at least 1 is garbage and reads as page 1. Never throws.
 */
function parsePageParam(raw: string | undefined): number {
  if (raw === undefined || !/^\d+(e\+?\d+)?$/i.test(raw)) return 1;
  const n = Number(raw);
  return n >= 1 ? Math.min(n, MAX_GALLERY_PAGE) : 1;
}

/**
 * What the URL's slugs mean, resolved by the page before it parses: a city token through
 * `cities.resolveTokens` (so a former slug and a legacy id land on their city), an oblast token
 * against the 27 regions. There is no "all cities" lookup behind this: it holds only the cities
 * the URL names, and a token it does not know degrades to "that constraint did not apply".
 */
export type PlaceIdsBySlug = {
  readonly cities: ReadonlyMap<string, CityId>;
  readonly regions: ReadonlyMap<string, RegionId>;
};
export const NO_PLACE_IDS: PlaceIdsBySlug = { cities: new Map(), regions: new Map() };

/**
 * The slug a URL writes for a city or an oblast, by id. One map for both kinds: the ids are
 * UUIDs from disjoint sources (regions are fixed `uuidV5(code)` constants, cities random or
 * `uuidV5(katottg_code)`), so a lookup can never answer for the wrong kind. Built by the page from
 * the labels it already holds; an id it has no slug for is dropped from the link it writes.
 */
export type CitySlugsById = ReadonlyMap<CityId | RegionId, string>;

/** The most `obl` tokens a request reads: 27 regions exist. City tokens share the contract's cap. */
const MAX_REGION_TOKENS = 27;

/**
 * The city tokens of a request, ready for `cities.resolveTokens`: empty ones (`?misto=`, a trailing
 * comma, `a,,b`) and ones over the contract's length are dropped, the rest deduplicated and capped
 * at the contract's count. A hand-edited URL therefore degrades to "no city filter" as it always did,
 * instead of failing the contract's validation and landing on the error page.
 */
export const cityTokensOf = (searchParams: SearchParams): string[] =>
  [
    ...new Set(
      tokensOf(searchParams[CITY_PARAM])
        .map((token) => token.trim())
        .filter((token) => token.length > 0 && token.length <= MAX_CITY_TOKEN_LENGTH),
    ),
  ].slice(0, MAX_CITY_TOKENS);

function parseCitySelection(
  raw: string | string[] | undefined,
  citiesBySlug: ReadonlyMap<string, CityId>,
): FilterSelection<CityId> {
  // A token resolves through the page's lookup (current slug, former slug, legacy id). An id the
  // lookup does not know is still honoured when well-formed: an unknown-but-valid id degrades the
  // same "stale link, not an error" way an unknown slug does.
  const values = [
    ...new Set(
      tokensOf(raw)
        .slice(0, MAX_CITY_TOKENS)
        .map((token) => citiesBySlug.get(token) ?? parseCityId(token))
        .filter((id): id is CityId => id !== null),
    ),
  ];

  const [first, ...rest] = values;
  if (first === undefined) return ANY;
  return { kind: "oneOf", values: [first, ...rest] };
}

function parseRegionSelection(
  raw: string | string[] | undefined,
  regionsBySlug: ReadonlyMap<string, RegionId>,
): FilterSelection<RegionId> {
  const values = [
    ...new Set(
      tokensOf(raw)
        .slice(0, MAX_REGION_TOKENS)
        .map((token) => regionsBySlug.get(token))
        .filter((id): id is RegionId => id !== undefined),
    ),
  ];

  const [first, ...rest] = values;
  if (first === undefined) return ANY;
  return { kind: "oneOf", values: [first, ...rest] };
}

/**
 * `searchParams` arrives as `Record<string, string | string[] | undefined>`
 * (Next's own shape for a page's `searchParams` prop) - every value is
 * untrusted input, so this is the one place in the gallery feature that
 * validates rather than trusts. Invalid or unrecognised tokens are dropped
 * silently rather than rejected: a hand-edited or stale URL degrades to
 * "that constraint didn't apply" instead of an error page, the same
 * "past-the-boundary link is a stale link, not a mistake" posture
 * `docs/gallery-contract-decisions.md` §3 takes for the page number.
 *
 * Immediately canonicalized (`canonicalizeFilters`) so a URL that spells
 * "every species" out explicitly and one that omits the param entirely
 * behave identically from here on - same reason that function exists for
 * cursor stability, applied to page rendering instead.
 */
export function parseGalleryQuery(
  searchParams: SearchParams,
  placeIds: PlaceIdsBySlug,
): GalleryQuery {
  const filters = canonicalizeFilters({
    regions: parseRegionSelection(searchParams[REGION_PARAM], placeIds.regions),
    cities: parseCitySelection(searchParams[CITY_PARAM], placeIds.cities),
    species: parseSelection<AnimalSpecies>(searchParams[SPECIES_PARAM], ANIMAL_SPECIES),
    sizes: parseSelection<SizeBucket>(searchParams[SIZE_PARAM], SIZE_BUCKETS),
    ages: parseSelection<AgeBucket>(searchParams[AGE_PARAM], AGE_BUCKETS),
    sexes: parseSelection<AnimalSex>(searchParams[SEX_PARAM], ANIMAL_SEXES),
  });

  const sort: GallerySort =
    parseEnum(GALLERY_SORTS, firstValue(searchParams[SORT_PARAM])) ?? DEFAULT_GALLERY_SORT;

  const page = parsePageParam(firstValue(searchParams[PAGE_PARAM]));

  return { filters, sort, page };
}

/**
 * A link that names a city by a former slug (`?misto=brovary`, renamed to `brovary-kyivska`) or by
 * a pre-slug id (`?misto=<uuid>`) still has to work, but should not stay the canonical form: this
 * is the other half of `parseGalleryQuery`, called once by each page-level route before it
 * renders. `cities` is `cities.resolveTokens`' answer for the request's `misto` tokens. Null
 * means the URL is already canonical (or has no city param at all), or contains a raw id nothing
 * resolved; a string means "308 here instead."
 *
 * Rewrites only the value of the city param. Every other param survives unchanged once re-parsed,
 * never dropped or altered. Not literally byte-for-byte: `URLSearchParams` re-serialises the whole
 * query string, so `misto` always ends up last and a value `URLSearchParams` encodes differently
 * than the source URL did comes out re-encoded; the decoded *value* is what is guaranteed. A token
 * that is already a current slug (or unknown, and not UUID-shaped) is carried through unchanged.
 *
 * An id-shaped token nothing resolved does **not** get silently dropped (that would change what
 * the link shows from "no matches for this city" to "every city", and this redirect is permanent
 * and cached by the browser): this bails out to `null` and the request falls through to the
 * normal render, where `parseGalleryQuery`'s tolerant parsing handles the id as it always did.
 */
export function redirectHrefForNonCanonicalCities(
  searchParams: SearchParams,
  path: string,
  cities: readonly CityTokenResolution[],
): string | null {
  const cityTokens = tokensOf(searchParams[CITY_PARAM]);
  if (cityTokens.length === 0) return null;

  const resolved = new Map(cities.map((entry) => [entry.token, entry]));
  const rewritten: string[] = [];
  let sawRewrite = false;
  for (const token of cityTokens) {
    const entry = resolved.get(token);
    if (entry?.city && (entry.via === "alias" || entry.via === "id")) {
      sawRewrite = true;
      rewritten.push(entry.city.slug);
    } else if (!entry?.city && parseCityId(token) !== null) {
      return null;
    } else {
      rewritten.push(token);
    }
  }
  if (!sawRewrite) return null;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === CITY_PARAM) continue;
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      params.append(key, v);
    }
  }
  params.set(CITY_PARAM, [...new Set(rewritten)].join(","));

  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

/**
 * A native `<form method="GET">` submission and Next's `searchParams` prop
 * carry the same information in the same shape (repeated keys become an
 * array), so the sheet's JS-intercepted submit re-uses `parseGalleryQuery`
 * rather than reading `FormData` into a URL of its own: one parser, one
 * `galleryHref` writer, and therefore one URL scheme - the rail and the
 * sheet cannot drift into two spellings of the same state.
 */
export function searchParamsFromFormData(formData: FormData): SearchParams {
  const params: Record<string, string[]> = {};
  for (const [key, value] of formData) {
    // Every field in this form is a checkbox/radio value, never a file
    // input - the string check is a type-narrowing formality, not a real
    // branch this form can hit the other side of.
    if (typeof value !== "string") continue;
    const existing = params[key];
    if (existing) existing.push(value);
    else params[key] = [value];
  }
  return params;
}

const toggle = <T extends string>(selection: FilterSelection<T>, value: T): FilterSelection<T> => {
  const current: readonly T[] = selection.kind === "any" ? [] : selection.values;
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  const [first, ...rest] = next;
  if (first === undefined) return ANY;
  return { kind: "oneOf", values: [first, ...rest] };
};

export const withToggledCity = (filters: FeedFilters, cityId: CityId): FeedFilters =>
  canonicalizeFilters({ ...filters, cities: toggle(filters.cities, cityId) });

/**
 * Selecting an oblast keeps the cities picked elsewhere; deselecting it drops the cities that
 * belong to it (their meaning was "narrow this oblast", which no longer exists). `regionOfCity`
 * comes from the labels the page already holds; a picked city it does not know is kept.
 */
export function withToggledRegion(
  filters: FeedFilters,
  regionId: RegionId,
  regionOfCity: ReadonlyMap<CityId, RegionId>,
): FeedFilters {
  const regions = toggle(filters.regions, regionId);
  if (isExplicitlySelected(regions, regionId)) {
    return canonicalizeFilters({ ...filters, regions });
  }
  const kept =
    filters.cities.kind === "oneOf"
      ? filters.cities.values.filter((id) => regionOfCity.get(id) !== regionId)
      : [];
  const [first, ...rest] = kept;
  const cities: FilterSelection<CityId> =
    first === undefined ? ANY : { kind: "oneOf", values: [first, ...rest] };
  return canonicalizeFilters({ ...filters, regions, cities });
}

/**
 * The species toggle's own write (gallery filter restructure): exclusive
 * choice, not the multi-select every other dimension above uses - tapping
 * "Cats" while "Dogs" is selected replaces it, it doesn't add to it.
 * Tapping the already-selected option clears back to "any", since a toggle
 * has no separate clear control the way a dropdown does.
 */
export const withOnlySpecies = (filters: FeedFilters, species: AnimalSpecies): FeedFilters =>
  canonicalizeFilters({
    ...filters,
    species: isExplicitlySelected(filters.species, species)
      ? ANY
      : { kind: "oneOf", values: [species] },
  });

export const withToggledSize = (filters: FeedFilters, size: SizeBucket): FeedFilters =>
  canonicalizeFilters({ ...filters, sizes: toggle(filters.sizes, size) });

export const withToggledAge = (filters: FeedFilters, age: AgeBucket): FeedFilters =>
  canonicalizeFilters({ ...filters, ages: toggle(filters.ages, age) });

export const withToggledSex = (filters: FeedFilters, sex: AnimalSex): FeedFilters =>
  canonicalizeFilters({ ...filters, sexes: toggle(filters.sexes, sex) });

/** Any id the map has no slug for is dropped from the link. In practice every id in the filters
 * came from the page's own labels (the URL's resolved tokens, the facet options), so this is a
 * safety net, not an expected path. */
function slugsOf(ids: readonly (CityId | RegionId)[], slugs: CitySlugsById): string[] {
  return ids.map((id) => slugs.get(id)).filter((slug): slug is string => slug !== undefined);
}

/**
 * The filter half of every URL this file writes: one writer, so a dimension added here reaches every link.
 */
function filterParams(filters: FeedFilters, citySlugs: CitySlugsById): URLSearchParams {
  const canonical = canonicalizeFilters(filters);
  const params = new URLSearchParams();

  if (canonical.regions.kind === "oneOf") {
    const slugs = slugsOf(canonical.regions.values, citySlugs);
    if (slugs.length > 0) params.set(REGION_PARAM, slugs.join(","));
  }
  if (canonical.cities.kind === "oneOf") {
    const slugs = slugsOf(canonical.cities.values, citySlugs);
    if (slugs.length > 0) params.set(CITY_PARAM, slugs.join(","));
  }
  if (canonical.species.kind === "oneOf") {
    params.set(SPECIES_PARAM, canonical.species.values.join(","));
  }
  if (canonical.sizes.kind === "oneOf") {
    params.set(SIZE_PARAM, canonical.sizes.values.join(","));
  }
  if (canonical.ages.kind === "oneOf") {
    params.set(AGE_PARAM, canonical.ages.values.join(","));
  }
  if (canonical.sexes.kind === "oneOf") {
    params.set(SEX_PARAM, canonical.sexes.values.join(","));
  }

  return params;
}

function filterAndSortParams(
  filters: FeedFilters,
  sort: GallerySort,
  citySlugs: CitySlugsById,
): URLSearchParams {
  const params = filterParams(filters, citySlugs);
  if (sort !== DEFAULT_GALLERY_SORT) {
    params.set(SORT_PARAM, sort);
  }
  return params;
}

/**
 * `page` is deliberately never carried forward here: a filter or sort
 * change always returns to page 1 (the previous page number belongs to a
 * result set that no longer exists), and page 1 has no `stor` param at all
 * - matching `sort`'s own "default is the absent param" convention, not a
 * second one.
 */
export function galleryHref(
  filters: FeedFilters,
  sort: GallerySort,
  citySlugs: CitySlugsById,
  basePath: string = GALLERY_PATH,
): string {
  const qs = filterAndSortParams(filters, sort, citySlugs).toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/** The gallery's own path; a shelter page passes its own as `basePath` to reuse the same links. */
export const GALLERY_PATH = "/tvaryny";

/**
 * A page link, unlike `galleryHref` above: filters and sort are carried
 * forward unchanged (a page link refines "where in this result set,"
 * never "which result set"), and `page` itself follows the same
 * absent-param-is-the-default convention `sort` already uses - page 1 has
 * no `stor` in the URL, so the first page's own link matches what
 * `parseGalleryQuery` already treats as the implicit start.
 */
export function galleryPageHref(
  filters: FeedFilters,
  sort: GallerySort,
  page: number,
  citySlugs: CitySlugsById,
  basePath: string = GALLERY_PATH,
): string {
  const params = filterAndSortParams(filters, sort, citySlugs);
  if (page > 1) {
    params.set(PAGE_PARAM, String(page));
  }

  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/**
 * Pet card PR 5, decision B: a card link (and the overlay's own prev/next
 * links) carry the gallery's current filter and sort context, so
 * `animals.neighbours` (the overlay's server-side call) can compute the
 * right walk through the same result set the visitor is actually browsing -
 * without it, every card link would open an animal with no idea which
 * gallery it came from. Same param scheme as `galleryHref`/`galleryPageHref`
 * (reuses `filterAndSortParams`), just rooted at `/tvaryny/{id}` instead of
 * `/tvaryny`. No `page` param, for the same reason `galleryHref` carries
 * none: opening one animal isn't "go to this result-set page."
 */
export function animalPageHref(
  animalId: AnimalId,
  filters: FeedFilters,
  sort: GallerySort,
  citySlugs: CitySlugsById,
): string {
  const qs = filterAndSortParams(filters, sort, citySlugs).toString();
  return qs ? `/tvaryny/${animalId}?${qs}` : `/tvaryny/${animalId}`;
}

/**
 * "Скинути" - clears every filter dimension, keeps the current sort. No
 * `citySlugs` parameter: `NO_FILTERS.cities` is always `{ kind: "any" }` by
 * definition, so `galleryHref`'s own city-slug lookup can never fire for
 * this call - threading a map through that is provably always unused would
 * be surface for its own sake.
 */
export const resetFiltersHref = (sort: GallerySort, basePath: string = GALLERY_PATH): string =>
  galleryHref(NO_FILTERS, sort, NO_CITY_SLUGS, basePath);

/** Passed to `galleryHref` only by `resetFiltersHref` above and
 * `similarAnimalsHref` below, where the city dimension is always `ANY` and the
 * map is provably never consulted. */
const NO_CITY_SLUGS: CitySlugsById = new Map();

/**
 * One fact on an animal's card that the gallery can filter on: the chip a
 * person taps to see more animals like this one in that respect. `sexes`
 * reverses SF-D5 (gallery filter restructure): sex is one of the four
 * dimensions the restructure keeps as a real filter, so its chip becomes
 * tappable along with it - SF-D5's "out of scope for this feature" was
 * about the sex-filter PR alone, and this is exactly the broader feature
 * that question was left open for. Fur, temperament and colour left this
 * union the same way they left `FeedFilters` - removed, not merely
 * stopped-at. City is not here because «more like this» means the animal,
 * not the place.
 */
export type FilterableChip =
  | { dimension: "ages"; value: AgeBucket }
  | { dimension: "sizes"; value: SizeBucket }
  | { dimension: "sexes"; value: AnimalSex };

const only = <T>(value: T): FilterSelection<T> => ({ kind: "oneOf", values: [value] });

/** `filters` narrowed to exactly the chip's one value on the chip's dimension. */
function withOnlyChip(filters: FeedFilters, chip: FilterableChip): FeedFilters {
  switch (chip.dimension) {
    case "ages":
      return { ...filters, ages: only(chip.value) };
    case "sizes":
      return { ...filters, sizes: only(chip.value) };
    case "sexes":
      return { ...filters, sexes: only(chip.value) };
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled chip; unreachable at runtime */
    default: {
      const unreachable: never = chip;
      return unreachable;
    }
  }
}

/**
 * The gallery link behind a chip on the pet card (PR 5 renders the chip):
 * the animal's species plus that one fact, every other filter cleared, the
 * default sort and no city scope. A fresh question, not a refinement of
 * whatever the person filtered before reaching the card: «more shy cats»
 * means every shy cat, not every shy cat in the one city they had picked.
 * The species stays because a chip is read as describing this animal, and
 * «Соромʼязливі» from a cat's card that lists dogs would answer a question
 * nobody asked.
 */
export function similarAnimalsHref(species: AnimalSpecies, chip: FilterableChip): string {
  const filters = withOnlyChip({ ...NO_FILTERS, species: only(species) }, chip);
  return galleryHref(filters, DEFAULT_GALLERY_SORT, NO_CITY_SLUGS);
}

/**
 * A filterable chip's own visible text - the dimension's existing label,
 * exactly as the filter dropdown already shows it (`AGE_WORDS`/`SIZE_WORDS`/
 * `SEX_WORDS` below). Defined here, ahead of those `const` maps in this
 * file, because `const` bindings (unlike `function`) aren't usable before
 * their own declaration runs - this only works because nothing calls this
 * function until the whole module has finished loading.
 */
export function chipDisplayLabel(chip: FilterableChip): string {
  switch (chip.dimension) {
    case "ages":
      return AGE_WORDS[chip.value];
    case "sizes":
      return SIZE_WORDS[chip.value];
    case "sexes":
      return SEX_WORDS[chip.value];
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled chip; unreachable at runtime */
    default: {
      const unreachable: never = chip;
      return unreachable;
    }
  }
}

const CHIP_SPECIES_WORDS: Record<AnimalSpecies, string> = {
  cat: uk.detail.chipSpeciesCat,
  dog: uk.detail.chipSpeciesDog,
};

/**
 * A filterable chip link's accessible name (owner decision 8 + his exact
 * template, 2026-10-27: "«Показати схожих {котів|собак}: {значення}», with
 * no quotes around the value. The value is lowercase and uses the filter
 * form"). `{value}` reuses `chipDisplayLabel` above, lowercased, rather than
 * a separately-maintained set of lowercase words - one source per dimension,
 * the same discipline as the maps above.
 */
export function similarAnimalsLabel(species: AnimalSpecies, chip: FilterableChip): string {
  return fillTemplate(uk.detail.chipLinkName, {
    species: CHIP_SPECIES_WORDS[species],
    value: chipDisplayLabel(chip).toLowerCase(),
  });
}

const SIZE_WORDS: Record<SizeBucket, string> = {
  small: uk.filters.sizeSmall,
  medium: uk.filters.sizeMedium,
  large: uk.filters.sizeLarge,
};
const AGE_WORDS: Record<AgeBucket, string> = {
  baby: uk.filters.ageBaby,
  young: uk.filters.ageYoung,
  adult: uk.filters.ageAdult,
  senior: uk.filters.ageSenior,
};
const SEX_WORDS: Record<AnimalSex, string> = {
  male: uk.filters.sexMale,
  female: uk.filters.sexFemale,
  unknown: uk.filters.sexUnknown,
};
