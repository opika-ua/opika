import type {
  AgeBucket,
  AnimalSpecies,
  CityId,
  CitySlug,
  FeedFilters,
  FilterSelection,
  GallerySort,
  SizeBucket,
} from "@opika/domain";
import {
  AgeBucketSchema,
  ANY,
  AnimalSpeciesSchema,
  CityIdSchema,
  canonicalizeFilters,
  DEFAULT_GALLERY_SORT,
  GallerySortSchema,
  NO_FILTERS,
  SizeBucketSchema,
} from "@opika/domain";
import { uk } from "@opika/i18n";

/**
 * The design's own URL example (`/tvaryny?misto=brovary&stor=1`,
 * docs/design/README.md "Gallery ↔ Deck") is now literal: `misto`'s value is
 * a city's `slug` (`docs/observations.md` O-6), not the raw `CityId` this
 * file used before the slug field existed. `vyd`/`rozmir`/`vik`
 * (species/size/age) are new — the design specifies the filter *groups*
 * (МІСТО/ВИД/РОЗМІР/ВІК) but never their query-param names, so these follow
 * `misto`/`stor`'s transliteration convention.
 *
 * Every function below that reads or writes the city param needs a lookup
 * between `CityId` (what `FeedFilters` and every domain/contract type carry)
 * and `CitySlug` (what the URL carries) — cities are seed/admin data, not
 * something these pure functions can fetch themselves, so the lookup always
 * arrives as a parameter built once by the caller (`cities.list`), the same
 * pattern `filtersInWords`'s own `cityNames` map already established below.
 */
const CITY_PARAM = "misto";
const SPECIES_PARAM = "vyd";
const SIZE_PARAM = "rozmir";
const AGE_PARAM = "vik";
const SORT_PARAM = "sort";
const PAGE_PARAM = "stor";

/**
 * The same six names, exported for the one caller that cannot go through
 * `galleryHref`: `FilterSheet`'s `<form method="GET">`, whose field `name`
 * attributes ARE the query keys the browser submits with no JS running.
 * Spelling them as literals there would be a second, uncompiled copy of
 * this file's scheme — the drift `parseGalleryQuery` could not detect,
 * because a renamed param and a stale `name=` both parse to "that
 * constraint didn't apply."
 */
export const GALLERY_PARAM = {
  city: CITY_PARAM,
  species: SPECIES_PARAM,
  size: SIZE_PARAM,
  age: AGE_PARAM,
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
 * `vyd` produces a *repeated* param (`?vyd=dog&vyd=cat`) — an array here,
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
  schema: { safeParse: (value: unknown) => { success: boolean; data?: T } },
): FilterSelection<T> {
  const values = [
    ...new Set(
      tokensOf(raw)
        .map((token) => schema.safeParse(token))
        .filter((result): result is { success: true; data: T } => result.success)
        .map((result) => result.data),
    ),
  ];

  const [first, ...rest] = values;
  if (first === undefined) return ANY;
  return { kind: "oneOf", values: [first, ...rest] };
}

/** The two directions every city-param function below needs — built once by
 * the caller from `cities.list`, never fetched by these pure functions. */
export type CitySlugsById = ReadonlyMap<CityId, CitySlug>;
export type CityIdsBySlug = ReadonlyMap<CitySlug, CityId>;

/**
 * A city token gets two chances, not one: the current slug form via
 * `citiesBySlug`, and — for a link already in circulation before slugs
 * existed — the raw `CityId` form, accepted only when it's a well-formed
 * UUID (not looked up against `citiesBySlug`'s values; an unknown-but-valid
 * id degrades the same "stale link, not an error" way an unknown slug does,
 * matching this file's existing tolerance for a since-removed city).
 * `redirectHrefForLegacyCityIds`, not this function, decides whether a
 * request using the second form gets redirected to the first.
 */
function parseCitySelection(
  raw: string | string[] | undefined,
  citiesBySlug: CityIdsBySlug,
): FilterSelection<CityId> {
  const values = [
    ...new Set(
      tokensOf(raw)
        .map((token) => citiesBySlug.get(token as CitySlug) ?? CityIdSchema.safeParse(token).data)
        .filter((id): id is CityId => id !== undefined),
    ),
  ];

  const [first, ...rest] = values;
  if (first === undefined) return ANY;
  return { kind: "oneOf", values: [first, ...rest] };
}

/**
 * `searchParams` arrives as `Record<string, string | string[] | undefined>`
 * (Next's own shape for a page's `searchParams` prop) — every value is
 * untrusted input, so this is the one place in the gallery feature that
 * validates rather than trusts. Invalid or unrecognised tokens are dropped
 * silently rather than rejected: a hand-edited or stale URL degrades to
 * "that constraint didn't apply" instead of an error page, the same
 * "past-the-boundary link is a stale link, not a mistake" posture
 * `docs/gallery-contract-decisions.md` §3 takes for the page number.
 *
 * Immediately canonicalized (`canonicalizeFilters`) so a URL that spells
 * "every species" out explicitly and one that omits the param entirely
 * behave identically from here on — same reason that function exists for
 * cursor stability, applied to page rendering instead.
 */
export function parseGalleryQuery(
  searchParams: SearchParams,
  citiesBySlug: CityIdsBySlug,
): GalleryQuery {
  const filters = canonicalizeFilters({
    cities: parseCitySelection(searchParams[CITY_PARAM], citiesBySlug),
    species: parseSelection<AnimalSpecies>(searchParams[SPECIES_PARAM], AnimalSpeciesSchema),
    sizes: parseSelection<SizeBucket>(searchParams[SIZE_PARAM], SizeBucketSchema),
    ages: parseSelection<AgeBucket>(searchParams[AGE_PARAM], AgeBucketSchema),
  });

  const sortResult = GallerySortSchema.safeParse(firstValue(searchParams[SORT_PARAM]));
  const sort: GallerySort = sortResult.success ? sortResult.data : DEFAULT_GALLERY_SORT;

  const pageRaw = Number(firstValue(searchParams[PAGE_PARAM]));
  const page = Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : 1;

  return { filters, sort, page };
}

/**
 * A pre-slug link (`?misto=<uuid>`) still has to work — dropping support
 * outright would break every link already shared — but it should not stay
 * the canonical form once a slug exists for it. `parseGalleryQuery` already
 * accepts either form; this is the other half, called once by each page-level
 * route before it renders: null means either the URL is already canonical
 * (or has no city param at all), or it contains a raw id this function
 * cannot confidently rewrite (see below) — a string means "308 here
 * instead."
 *
 * Rewrites only the value of the city param — every other param's value
 * (`stor`, `sort`, `vyd`, `rozmir`, `vik`, or anything this file doesn't
 * recognise) survives unchanged once re-parsed, never dropped or altered.
 * Not literally byte-for-byte: `URLSearchParams` re-serialises the whole
 * query string, so `misto` always ends up last regardless of where it sat
 * originally, and a value containing characters `URLSearchParams` encodes
 * differently than the source URL did (spaces, `+`, non-ASCII) comes out
 * re-encoded, not copied verbatim — the *value*, decoded, is what's
 * guaranteed, not the query string's literal text. A
 * token already in slug form (not UUID-shaped) is likewise carried through
 * unchanged — a `?misto=<uuid>,brovary` link rewrites only the id half, it
 * does not lose the city that was already canonical.
 *
 * A `CityId`-shaped token with no entry in `citySlugs` (a since-deleted
 * city, or a malformed id that merely happens to parse) does **not** get
 * silently dropped here the way an unrecognised token does elsewhere in
 * this file — dropping it would change what the link shows (from "no
 * matches for this city" to "every city," a materially different result)
 * and this redirect is permanent (308, cached by the browser). Rather than
 * ship a wrong cached redirect, this bails out to `null` entirely: the
 * request falls through to the normal render path, where
 * `parseGalleryQuery`'s own tolerant parsing handles the id exactly as it
 * always did.
 */
export function redirectHrefForLegacyCityIds(
  searchParams: SearchParams,
  path: string,
  citySlugs: CitySlugsById,
): string | null {
  const cityTokens = tokensOf(searchParams[CITY_PARAM]);
  if (cityTokens.length === 0) return null;

  const rewritten: string[] = [];
  let sawResolvableLegacyId = false;
  for (const token of cityTokens) {
    const parsedId = CityIdSchema.safeParse(token);
    if (!parsedId.success) {
      rewritten.push(token);
      continue;
    }
    const slug = citySlugs.get(parsedId.data);
    if (slug === undefined) return null;
    sawResolvableLegacyId = true;
    rewritten.push(slug);
  }
  if (!sawResolvableLegacyId) return null;

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
 * `galleryHref` writer, and therefore one URL scheme — the rail and the
 * sheet cannot drift into two spellings of the same state.
 */
export function searchParamsFromFormData(formData: FormData): SearchParams {
  const params: Record<string, string[]> = {};
  for (const [key, value] of formData) {
    // Every field in this form is a checkbox/radio value, never a file
    // input — the string check is a type-narrowing formality, not a real
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

export const withToggledSpecies = (filters: FeedFilters, species: AnimalSpecies): FeedFilters =>
  canonicalizeFilters({ ...filters, species: toggle(filters.species, species) });

export const withToggledSize = (filters: FeedFilters, size: SizeBucket): FeedFilters =>
  canonicalizeFilters({ ...filters, sizes: toggle(filters.sizes, size) });

export const withToggledAge = (filters: FeedFilters, age: AgeBucket): FeedFilters =>
  canonicalizeFilters({ ...filters, ages: toggle(filters.ages, age) });

/** Any `CityId` the map has no slug for is dropped — see `parseCitySelection`'s
 * own comment on the same "unmappable degrades silently" posture. In
 * practice every id in `filters.cities` came from `cities.list` in the first
 * place, so this is a safety net, not an expected path. */
function citySlugsOf(ids: readonly CityId[], citySlugs: CitySlugsById): string[] {
  return ids.map((id) => citySlugs.get(id)).filter((slug): slug is CitySlug => slug !== undefined);
}

function filterAndSortParams(
  filters: FeedFilters,
  sort: GallerySort,
  citySlugs: CitySlugsById,
): URLSearchParams {
  const canonical = canonicalizeFilters(filters);
  const params = new URLSearchParams();

  if (canonical.cities.kind === "oneOf") {
    const slugs = citySlugsOf(canonical.cities.values, citySlugs);
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
  if (sort !== DEFAULT_GALLERY_SORT) {
    params.set(SORT_PARAM, sort);
  }

  return params;
}

/**
 * `page` is deliberately never carried forward here: a filter or sort
 * change always returns to page 1 (the previous page number belongs to a
 * result set that no longer exists), and page 1 has no `stor` param at all
 * — matching `sort`'s own "default is the absent param" convention, not a
 * second one.
 */
export function galleryHref(
  filters: FeedFilters,
  sort: GallerySort,
  citySlugs: CitySlugsById,
): string {
  const qs = filterAndSortParams(filters, sort, citySlugs).toString();
  return qs ? `/tvaryny?${qs}` : "/tvaryny";
}

/**
 * A page link, unlike `galleryHref` above: filters and sort are carried
 * forward unchanged (a page link refines "where in this result set,"
 * never "which result set"), and `page` itself follows the same
 * absent-param-is-the-default convention `sort` already uses — page 1 has
 * no `stor` in the URL, so the first page's own link matches what
 * `parseGalleryQuery` already treats as the implicit start.
 */
export function galleryPageHref(
  filters: FeedFilters,
  sort: GallerySort,
  page: number,
  citySlugs: CitySlugsById,
): string {
  const params = filterAndSortParams(filters, sort, citySlugs);
  if (page > 1) {
    params.set(PAGE_PARAM, String(page));
  }

  const qs = params.toString();
  return qs ? `/tvaryny?${qs}` : "/tvaryny";
}

/**
 * "Скинути" — clears every filter dimension, keeps the current sort. No
 * `citySlugs` parameter: `NO_FILTERS.cities` is always `{ kind: "any" }` by
 * definition, so `galleryHref`'s own city-slug lookup can never fire for
 * this call — threading a map through that is provably always unused would
 * be surface for its own sake.
 */
export const resetFiltersHref = (sort: GallerySort): string =>
  galleryHref(NO_FILTERS, sort, NO_CITY_SLUGS);

/** Passed to `galleryHref` only by `resetFiltersHref` above, where the city
 * dimension is always `ANY` and the map is provably never consulted. */
const NO_CITY_SLUGS: CitySlugsById = new Map();

/**
 * `total` isn't a gallery filter dimension — it rides along on the deck
 * entry link for one reason only, documented on `deckEntryHref` below.
 */
const TOTAL_PARAM = "total";

/**
 * The gallery already knows `totalMatching` (it just fetched `gallery.list`
 * to render); `feed.list` has no total field at all — a keyset feed doesn't
 * paginate by count. Carrying the number across at the moment of the click
 * is cheaper and more honest than inventing a second query just to restate
 * a number the caller already has. `parseDeckQuery`'s `total` comes back
 * `null` for anyone who reaches `/tvaryny/gortaty` without it (a reload, a
 * bookmark, a shared link) — the deck header degrades to showing position
 * alone rather than guessing a denominator it was never given.
 */
export function deckEntryHref(
  filters: FeedFilters,
  total: number,
  citySlugs: CitySlugsById,
): string {
  const canonical = canonicalizeFilters(filters);
  const params = new URLSearchParams();

  if (canonical.cities.kind === "oneOf") {
    const slugs = citySlugsOf(canonical.cities.values, citySlugs);
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
  params.set(TOTAL_PARAM, String(total));

  return `/tvaryny/gortaty?${params.toString()}`;
}

export type DeckQuery = { filters: FeedFilters; total: number | null };

/**
 * A sanity bound, not a real domain ceiling — checked, not assumed to
 * mirror one. `gallery.list`'s `totalMatching` is an uncapped
 * `count(*) OVER()` (`packages/db/src/repos/gallery-repo.ts`); only
 * *navigable pages* are capped at `MAX_GALLERY_NAVIGABLE_ROWS` rows
 * (`docs/standing-constraints.md`), so there is no real number
 * `totalMatching` itself provably can't exceed. This exists only to reject
 * an obviously-fabricated `?total=` (a hand-edited or malicious URL) —
 * comfortably above any plausible real total for this app's actual scale
 * (a single-oblast platform; the seeded corpus is 320), not derived from
 * any other constant in the codebase.
 */
const MAX_PLAUSIBLE_DECK_TOTAL = 1_000_000;

/**
 * The deck's own reading of the same URL scheme `parseGalleryQuery` reads —
 * same four filter params, `sort`/`stor` simply don't apply to a
 * cursor-paginated feed and are ignored if present (a stray `?stor=3`
 * carried over by accident degrades to "unused," not an error, matching
 * this file's existing posture toward unrecognised input). `total` is an
 * untrusted value read back out of a URL — see `MAX_PLAUSIBLE_DECK_TOTAL`
 * above — so a hand-edited or malicious `?total=` gets the same "stale
 * link, not an error" treatment `parseGalleryQuery`'s own page-number
 * parsing already gives out-of-range input, rather than rendering
 * whatever number was typed.
 */
export function parseDeckQuery(searchParams: SearchParams, citiesBySlug: CityIdsBySlug): DeckQuery {
  const { filters } = parseGalleryQuery(searchParams, citiesBySlug);

  const totalRaw = Number(firstValue(searchParams[TOTAL_PARAM]));
  // > 0, not >= 0: deckEntryHref is only ever built when the gallery found
  // at least one match (page.tsx's own totalMatching > 0 guard), so a
  // legitimate link never carries ?total=0 — one arriving here is already
  // a stale or hand-edited URL, same treatment as any other untrusted value.
  const total =
    Number.isInteger(totalRaw) && totalRaw > 0 && totalRaw <= MAX_PLAUSIBLE_DECK_TOTAL
      ? totalRaw
      : null;

  return { filters, total };
}

const SPECIES_WORDS: Record<AnimalSpecies, string> = {
  dog: uk.filters.speciesDogs,
  cat: uk.filters.speciesCats,
};
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

/**
 * "Бровари · собаки · середні" — `docs/design/README.md`'s "Deck chrome and
 * the mode switch," the header phrase naming what the deck inherited from
 * the gallery. Only dimensions actually constrained are named; entering the
 * deck with every dimension at `ANY` says nothing extra, rather than
 * inventing a claim like "every city" that reads as a filter when it isn't
 * one.
 *
 * Deviation: the mock's own example uses plural adjective agreement
 * ("середні," not "середній") this codebase's label catalogue doesn't
 * carry — the same class of gap as E4's ordinal-page deviation
 * (`docs/design/README.md`'s "Out-of-range page" note). Shipped as the
 * existing filter-chip labels, lower-cased, rather than inventing new
 * declension entries with no groundwork anywhere else in the app.
 */
export function filtersInWords(
  filters: FeedFilters,
  cityNames: ReadonlyMap<CityId, string>,
): string | null {
  const canonical = canonicalizeFilters(filters);
  const parts: string[] = [];

  if (canonical.cities.kind === "oneOf") {
    const names = canonical.cities.values
      .map((id) => cityNames.get(id))
      .filter((name): name is string => Boolean(name));
    if (names.length > 0) parts.push(names.join("/"));
  }
  if (canonical.species.kind === "oneOf") {
    parts.push(canonical.species.values.map((s) => SPECIES_WORDS[s].toLowerCase()).join("/"));
  }
  if (canonical.sizes.kind === "oneOf") {
    parts.push(canonical.sizes.values.map((s) => SIZE_WORDS[s].toLowerCase()).join("/"));
  }
  if (canonical.ages.kind === "oneOf") {
    parts.push(canonical.ages.values.map((a) => AGE_WORDS[a].toLowerCase()).join("/"));
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}
