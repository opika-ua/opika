import type {
  AgeBucket,
  AnimalSpecies,
  CityId,
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

/**
 * The design's own URL example (`/tvaryny?misto=brovary&stor=1`,
 * docs/design/README.md "Gallery ↔ Deck") uses a slug — but `CityId` is a
 * bare UUID (`packages/domain/src/primitives/ids.ts`) with no slug field
 * anywhere in the schema. Treated as illustrative copy, not a literal
 * scheme: `misto`'s value is the raw `CityId`, consistent with this
 * codebase's existing precedent of raw UUIDs in URLs
 * (`docs/gallery-contract-decisions.md` §6, `/tvaryny/{id}`). `vyd`/
 * `rozmir`/`vik` (species/size/age) are new — the design specifies the
 * filter *groups* (МІСТО/ВИД/РОЗМІР/ВІК) but never their query-param
 * names, so these follow `misto`/`stor`'s transliteration convention.
 */
const CITY_PARAM = "misto";
const SPECIES_PARAM = "vyd";
const SIZE_PARAM = "rozmir";
const AGE_PARAM = "vik";
const SORT_PARAM = "sort";
const PAGE_PARAM = "stor";

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
export function parseGalleryQuery(searchParams: SearchParams): GalleryQuery {
  const filters = canonicalizeFilters({
    cities: parseSelection<CityId>(searchParams[CITY_PARAM], CityIdSchema),
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

/**
 * `page` is deliberately never carried forward here: a filter or sort
 * change always returns to page 1 (the previous page number belongs to a
 * result set that no longer exists), and page 1 has no `stor` param at all
 * — matching `sort`'s own "default is the absent param" convention, not a
 * second one.
 */
export function galleryHref(filters: FeedFilters, sort: GallerySort): string {
  const canonical = canonicalizeFilters(filters);
  const params = new URLSearchParams();

  if (canonical.cities.kind === "oneOf") {
    params.set(CITY_PARAM, canonical.cities.values.join(","));
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

  const qs = params.toString();
  return qs ? `/tvaryny?${qs}` : "/tvaryny";
}

/** "Скинути" — clears every filter dimension, keeps the current sort. */
export const resetFiltersHref = (sort: GallerySort): string => galleryHref(NO_FILTERS, sort);
