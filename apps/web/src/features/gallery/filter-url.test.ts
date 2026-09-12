import { ANY, type CityId, citySlugOf, NO_FILTERS } from "@opika/domain";
import { describe, expect, it } from "vitest";
import {
  type CityIdsBySlug,
  type CitySlugsById,
  deckEntryHref,
  filtersInWords,
  galleryHref,
  galleryPageHref,
  parseDeckQuery,
  parseGalleryQuery,
  redirectHrefForLegacyCityIds,
  resetFiltersHref,
  withToggledAge,
  withToggledCity,
  withToggledSize,
  withToggledSpecies,
} from "./filter-url";

const CITY_A = "11111111-1111-4111-8111-111111111111" as CityId;
const CITY_B = "22222222-2222-4222-8222-222222222222" as CityId;
const SLUG_A = citySlugOf("Brovary");
const SLUG_B = citySlugOf("Kyiv");

const CITY_SLUGS: CitySlugsById = new Map([
  [CITY_A, SLUG_A],
  [CITY_B, SLUG_B],
]);
const CITIES_BY_SLUG: CityIdsBySlug = new Map([
  [SLUG_A, CITY_A],
  [SLUG_B, CITY_B],
]);
const NO_CITIES: CitySlugsById = new Map();
const NO_SLUGS: CityIdsBySlug = new Map();

describe("parseGalleryQuery", () => {
  it("defaults to no filters, the default sort, and page 1 when nothing is present", () => {
    expect(parseGalleryQuery({}, NO_SLUGS)).toEqual({
      filters: NO_FILTERS,
      sort: "freshest",
      page: 1,
    });
  });

  it("parses a comma-separated multi-select dimension", () => {
    const { filters } = parseGalleryQuery({ vyd: "dog,cat" }, NO_SLUGS);
    // Both species selected collapses to "any" — canonicalizeFilters' own rule,
    // exercised here rather than re-asserted, since a multi-value parse is
    // exactly the shape that would hit it first.
    expect(filters.species).toEqual(ANY);
  });

  it("parses a single value from a multi-select dimension", () => {
    const { filters } = parseGalleryQuery({ vyd: "dog" }, NO_SLUGS);
    expect(filters.species).toEqual({ kind: "oneOf", values: ["dog"] });
  });

  it("drops an unrecognised token rather than throwing", () => {
    const { filters } = parseGalleryQuery({ rozmir: "not-a-real-size" }, NO_SLUGS);
    expect(filters.sizes).toEqual(ANY);
  });

  it("drops unrecognised tokens but keeps the recognised ones in the same value", () => {
    const { filters } = parseGalleryQuery({ vik: "baby,not-a-bucket,young" }, NO_SLUGS);
    expect(filters.ages).toEqual({ kind: "oneOf", values: ["baby", "young"] });
  });

  it("parses a city by its slug", () => {
    const { filters } = parseGalleryQuery({ misto: SLUG_A }, CITIES_BY_SLUG);
    expect(filters.cities).toEqual({ kind: "oneOf", values: [CITY_A] });
  });

  it("still accepts a raw CityId — the pre-slug link form, resolved without needing the slug map to know it", () => {
    const { filters } = parseGalleryQuery({ misto: CITY_A }, NO_SLUGS);
    expect(filters.cities).toEqual({ kind: "oneOf", values: [CITY_A] });
  });

  it("drops a well-formed but unknown slug rather than throwing", () => {
    const { filters } = parseGalleryQuery({ misto: "not-a-real-city" }, CITIES_BY_SLUG);
    expect(filters.cities).toEqual(ANY);
  });

  it("falls back to the default sort on an invalid sort value", () => {
    expect(parseGalleryQuery({ sort: "best_match" }, NO_SLUGS).sort).toBe("freshest");
  });

  it("parses a valid non-default sort", () => {
    expect(parseGalleryQuery({ sort: "longest_waiting" }, NO_SLUGS).sort).toBe("longest_waiting");
  });

  it("falls back to page 1 on a non-numeric or out-of-range page", () => {
    expect(parseGalleryQuery({ stor: "abc" }, NO_SLUGS).page).toBe(1);
    expect(parseGalleryQuery({ stor: "0" }, NO_SLUGS).page).toBe(1);
    expect(parseGalleryQuery({ stor: "-3" }, NO_SLUGS).page).toBe(1);
  });

  it("parses a valid page number", () => {
    expect(parseGalleryQuery({ stor: "4" }, NO_SLUGS).page).toBe(4);
  });

  it("keeps every value from a repeated query key, not just the first", () => {
    // A native <form method="GET"> submitting two checked boxes named the
    // same thing produces exactly this shape (?rozmir=small&rozmir=medium)
    // — the real submission FilterSheet relies on, not a synthetic case.
    // Two of three sizes, deliberately not all of them: with all three the
    // result collapses to "any" regardless of whether this bug is present,
    // which would make the assertion pass for the wrong reason.
    // canonicalizeFilters sorts values, so "medium" < "small" alphabetically.
    expect(parseGalleryQuery({ rozmir: ["small", "medium"] }, NO_SLUGS).filters.sizes).toEqual({
      kind: "oneOf",
      values: ["medium", "small"],
    });
  });

  it("keeps every repeated city — cities have no universe to collapse into, so this also covers the no-collapse path", () => {
    expect(parseGalleryQuery({ misto: [SLUG_A, SLUG_B] }, CITIES_BY_SLUG).filters.cities).toEqual({
      kind: "oneOf",
      values: [CITY_A, CITY_B],
    });
  });
});

describe("withToggled*", () => {
  it("adds a value not yet selected", () => {
    expect(withToggledSpecies(NO_FILTERS, "dog")).toEqual({
      ...NO_FILTERS,
      species: { kind: "oneOf", values: ["dog"] },
    });
  });

  it("removes a value already selected", () => {
    const once = withToggledSpecies(NO_FILTERS, "dog");
    expect(withToggledSpecies(once, "dog")).toEqual(NO_FILTERS);
  });

  it("selecting every value in the universe collapses back to any", () => {
    const dogSelected = withToggledSpecies(NO_FILTERS, "dog");
    const both = withToggledSpecies(dogSelected, "cat");
    expect(both.species).toEqual(ANY);
  });

  it("cities have no static universe, so selecting two never collapses", () => {
    const one = withToggledCity(NO_FILTERS, CITY_A);
    const two = withToggledCity(one, CITY_B);
    expect(two.cities.kind).toBe("oneOf");
  });

  it("toggling one dimension leaves the others untouched", () => {
    const withAge = withToggledAge(NO_FILTERS, "baby");
    const withAgeAndSize = withToggledSize(withAge, "small");
    expect(withAgeAndSize.ages).toEqual({ kind: "oneOf", values: ["baby"] });
    expect(withAgeAndSize.sizes).toEqual({ kind: "oneOf", values: ["small"] });
  });
});

describe("galleryHref", () => {
  it("is the bare route with no filters and the default sort", () => {
    expect(galleryHref(NO_FILTERS, "freshest", NO_CITIES)).toBe("/tvaryny");
  });

  it("omits the sort param for the default sort but includes a non-default one", () => {
    expect(galleryHref(NO_FILTERS, "longest_waiting", NO_CITIES)).toBe(
      "/tvaryny?sort=longest_waiting",
    );
  });

  it("writes the city as its slug, not the raw id", () => {
    const filters = withToggledCity(NO_FILTERS, CITY_A);
    expect(galleryHref(filters, "freshest", CITY_SLUGS)).toBe(`/tvaryny?misto=${SLUG_A}`);
  });

  it("drops a city the slug map has no entry for, rather than leaking the raw id", () => {
    const filters = withToggledCity(NO_FILTERS, CITY_A);
    expect(galleryHref(filters, "freshest", NO_CITIES)).toBe("/tvaryny");
  });

  it("round-trips through parseGalleryQuery", () => {
    const filters = withToggledSpecies(withToggledCity(NO_FILTERS, CITY_A), "dog");
    const href = galleryHref(filters, "longest_waiting", CITY_SLUGS);
    const reparsed = parseGalleryQuery(
      Object.fromEntries(new URL(href, "http://x").searchParams),
      CITIES_BY_SLUG,
    );
    expect(reparsed).toEqual({ filters, sort: "longest_waiting", page: 1 });
  });

  it("never carries a page param — a filter change always returns to page 1", () => {
    expect(galleryHref(NO_FILTERS, "freshest", NO_CITIES)).not.toContain("stor");
  });
});

describe("resetFiltersHref", () => {
  it("clears every filter but keeps the sort", () => {
    expect(resetFiltersHref("longest_waiting")).toBe("/tvaryny?sort=longest_waiting");
  });
});

describe("galleryPageHref", () => {
  it("page 1 has no stor param — matching sort's absent-param-is-default convention", () => {
    expect(galleryPageHref(NO_FILTERS, "freshest", 1, NO_CITIES)).toBe("/tvaryny");
  });

  it("carries a non-default page as ?stor=N", () => {
    expect(galleryPageHref(NO_FILTERS, "freshest", 3, NO_CITIES)).toBe("/tvaryny?stor=3");
  });

  it("carries filters and sort forward unchanged, unlike galleryHref", () => {
    const filters = withToggledSpecies(withToggledCity(NO_FILTERS, CITY_A), "dog");
    const href = galleryPageHref(filters, "longest_waiting", 2, CITY_SLUGS);
    const reparsed = parseGalleryQuery(
      Object.fromEntries(new URL(href, "http://x").searchParams),
      CITIES_BY_SLUG,
    );
    expect(reparsed).toEqual({ filters, sort: "longest_waiting", page: 2 });
  });

  it("orders params the same way galleryHref does, stor last", () => {
    expect(galleryPageHref(NO_FILTERS, "longest_waiting", 2, NO_CITIES)).toBe(
      "/tvaryny?sort=longest_waiting&stor=2",
    );
  });
});

describe("deckEntryHref / parseDeckQuery", () => {
  it("round-trips filters and carries the total through, with no sort/page params at all", () => {
    const filters = withToggledSpecies(withToggledCity(NO_FILTERS, CITY_A), "dog");
    const href = deckEntryHref(filters, 34, CITY_SLUGS);

    expect(href).not.toContain("sort=");
    expect(href).not.toContain("stor=");

    const reparsed = parseDeckQuery(
      Object.fromEntries(new URL(href, "http://x").searchParams),
      CITIES_BY_SLUG,
    );
    expect(reparsed).toEqual({ filters, total: 34 });
  });

  it("an unfiltered gallery produces a bare href with only the total", () => {
    expect(deckEntryHref(NO_FILTERS, 320, NO_CITIES)).toBe("/tvaryny/gortaty?total=320");
  });

  it("parseDeckQuery falls back to null when total is missing — direct navigation, not a filtered click", () => {
    expect(parseDeckQuery({}, NO_SLUGS)).toEqual({ filters: NO_FILTERS, total: null });
  });

  it("parseDeckQuery falls back to null on a garbage total rather than throwing", () => {
    expect(parseDeckQuery({ total: "not-a-number" }, NO_SLUGS)).toEqual({
      filters: NO_FILTERS,
      total: null,
    });
  });

  it("parseDeckQuery falls back to null on an implausibly large total — untrusted input, not rendered verbatim", () => {
    expect(parseDeckQuery({ total: "99999999" }, NO_SLUGS)).toEqual({
      filters: NO_FILTERS,
      total: null,
    });
  });

  it("parseDeckQuery falls back to null on total=0 — deckEntryHref never produces one, so it's already a stale or hand-edited link", () => {
    expect(parseDeckQuery({ total: "0" }, NO_SLUGS)).toEqual({ filters: NO_FILTERS, total: null });
  });

  it("ignores a stray sort/stor param carried over by accident", () => {
    const { filters } = parseDeckQuery(
      { sort: "longest_waiting", stor: "3", total: "10" },
      NO_SLUGS,
    );
    expect(filters).toEqual(NO_FILTERS);
  });
});

describe("filtersInWords", () => {
  const cityNames = new Map([[CITY_A, "Бровари"]]);

  it("names nothing when every dimension is unconstrained", () => {
    expect(filtersInWords(NO_FILTERS, cityNames)).toBeNull();
  });

  it("joins only the dimensions actually constrained, city first", () => {
    const filters = withToggledSize(
      withToggledSpecies(withToggledCity(NO_FILTERS, CITY_A), "dog"),
      "medium",
    );
    expect(filtersInWords(filters, cityNames)).toBe("Бровари · собаки · середній");
  });

  it("an unknown city id (map miss) is dropped rather than rendering 'undefined'", () => {
    const filters = withToggledCity(NO_FILTERS, CITY_B);
    expect(filtersInWords(filters, cityNames)).toBeNull();
  });

  it("multiple selected values in one dimension join with a slash", () => {
    const filters = withToggledAge(withToggledAge(NO_FILTERS, "baby"), "senior");
    expect(filtersInWords(filters, cityNames)).toBe("малюк/літній");
  });
});

describe("redirectHrefForLegacyCityIds", () => {
  it("is a no-op when there is no city param at all", () => {
    expect(redirectHrefForLegacyCityIds({}, "/tvaryny", CITY_SLUGS)).toBeNull();
  });

  it("is a no-op when the city param is already a slug", () => {
    expect(redirectHrefForLegacyCityIds({ misto: SLUG_A }, "/tvaryny", CITY_SLUGS)).toBeNull();
  });

  it("rewrites a raw CityId to its slug", () => {
    expect(redirectHrefForLegacyCityIds({ misto: CITY_A }, "/tvaryny", CITY_SLUGS)).toBe(
      `/tvaryny?misto=${SLUG_A}`,
    );
  });

  it("rewrites every legacy id when the slug map resolves all of them", () => {
    const href = redirectHrefForLegacyCityIds(
      { misto: `${CITY_A},${CITY_B}` },
      "/tvaryny",
      CITY_SLUGS,
    );
    const url = new URL(href ?? "", "http://x");
    expect(url.pathname).toBe("/tvaryny");
    expect(url.searchParams.get("misto")).toBe(`${SLUG_A},${SLUG_B}`);
  });

  it("preserves an already-slugged city alongside a rewritten legacy id, rather than dropping it", () => {
    const href = redirectHrefForLegacyCityIds(
      { misto: `${CITY_A},${SLUG_B}` },
      "/tvaryny",
      CITY_SLUGS,
    );
    const url = new URL(href ?? "", "http://x");
    expect(url.searchParams.get("misto")).toBe(`${SLUG_A},${SLUG_B}`);
  });

  it("does not redirect at all when a legacy id has no entry in the slug map — dropping it would change the result set, and this redirect is permanent", () => {
    const NO_ENTRY_FOR_B: CitySlugsById = new Map([[CITY_A, SLUG_A]]);
    expect(
      redirectHrefForLegacyCityIds({ misto: `${CITY_A},${CITY_B}` }, "/tvaryny", NO_ENTRY_FOR_B),
    ).toBeNull();
  });

  it("does not redirect on an unresolvable id even when it's the only city token", () => {
    expect(redirectHrefForLegacyCityIds({ misto: CITY_B }, "/tvaryny", NO_CITIES)).toBeNull();
  });

  it("preserves every other param byte-for-byte, including repeated ones", () => {
    const href = redirectHrefForLegacyCityIds(
      { misto: CITY_A, vyd: ["dog", "cat"], stor: "3" },
      "/tvaryny",
      CITY_SLUGS,
    );
    const url = new URL(href ?? "", "http://x");
    expect(url.pathname).toBe("/tvaryny");
    expect(url.searchParams.getAll("vyd")).toEqual(["dog", "cat"]);
    expect(url.searchParams.get("stor")).toBe("3");
    expect(url.searchParams.get("misto")).toBe(SLUG_A);
  });

  it("uses the given path — the deck's own route, not the gallery's", () => {
    expect(redirectHrefForLegacyCityIds({ misto: CITY_A }, "/tvaryny/gortaty", CITY_SLUGS)).toBe(
      `/tvaryny/gortaty?misto=${SLUG_A}`,
    );
  });
});
