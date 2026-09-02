import { ANY, type CityId, NO_FILTERS } from "@opika/domain";
import { describe, expect, it } from "vitest";
import {
  deckEntryHref,
  filtersInWords,
  galleryHref,
  galleryPageHref,
  parseDeckQuery,
  parseGalleryQuery,
  resetFiltersHref,
  withToggledAge,
  withToggledCity,
  withToggledSize,
  withToggledSpecies,
} from "./filter-url";

const CITY_A = "11111111-1111-4111-8111-111111111111" as CityId;
const CITY_B = "22222222-2222-4222-8222-222222222222" as CityId;

describe("parseGalleryQuery", () => {
  it("defaults to no filters, the default sort, and page 1 when nothing is present", () => {
    expect(parseGalleryQuery({})).toEqual({ filters: NO_FILTERS, sort: "freshest", page: 1 });
  });

  it("parses a comma-separated multi-select dimension", () => {
    const { filters } = parseGalleryQuery({ vyd: "dog,cat" });
    // Both species selected collapses to "any" — canonicalizeFilters' own rule,
    // exercised here rather than re-asserted, since a multi-value parse is
    // exactly the shape that would hit it first.
    expect(filters.species).toEqual(ANY);
  });

  it("parses a single value from a multi-select dimension", () => {
    const { filters } = parseGalleryQuery({ vyd: "dog" });
    expect(filters.species).toEqual({ kind: "oneOf", values: ["dog"] });
  });

  it("drops an unrecognised token rather than throwing", () => {
    const { filters } = parseGalleryQuery({ rozmir: "not-a-real-size" });
    expect(filters.sizes).toEqual(ANY);
  });

  it("drops unrecognised tokens but keeps the recognised ones in the same value", () => {
    const { filters } = parseGalleryQuery({ vik: "baby,not-a-bucket,young" });
    expect(filters.ages).toEqual({ kind: "oneOf", values: ["baby", "young"] });
  });

  it("parses a city as a raw CityId, not a slug", () => {
    const { filters } = parseGalleryQuery({ misto: CITY_A });
    expect(filters.cities).toEqual({ kind: "oneOf", values: [CITY_A] });
  });

  it("falls back to the default sort on an invalid sort value", () => {
    expect(parseGalleryQuery({ sort: "best_match" }).sort).toBe("freshest");
  });

  it("parses a valid non-default sort", () => {
    expect(parseGalleryQuery({ sort: "longest_waiting" }).sort).toBe("longest_waiting");
  });

  it("falls back to page 1 on a non-numeric or out-of-range page", () => {
    expect(parseGalleryQuery({ stor: "abc" }).page).toBe(1);
    expect(parseGalleryQuery({ stor: "0" }).page).toBe(1);
    expect(parseGalleryQuery({ stor: "-3" }).page).toBe(1);
  });

  it("parses a valid page number", () => {
    expect(parseGalleryQuery({ stor: "4" }).page).toBe(4);
  });

  it("keeps every value from a repeated query key, not just the first", () => {
    // A native <form method="GET"> submitting two checked boxes named the
    // same thing produces exactly this shape (?rozmir=small&rozmir=medium)
    // — the real submission FilterSheet relies on, not a synthetic case.
    // Two of three sizes, deliberately not all of them: with all three the
    // result collapses to "any" regardless of whether this bug is present,
    // which would make the assertion pass for the wrong reason.
    // canonicalizeFilters sorts values, so "medium" < "small" alphabetically.
    expect(parseGalleryQuery({ rozmir: ["small", "medium"] }).filters.sizes).toEqual({
      kind: "oneOf",
      values: ["medium", "small"],
    });
  });

  it("keeps every repeated city — cities have no universe to collapse into, so this also covers the no-collapse path", () => {
    expect(parseGalleryQuery({ misto: [CITY_A, CITY_B] }).filters.cities).toEqual({
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
    expect(galleryHref(NO_FILTERS, "freshest")).toBe("/tvaryny");
  });

  it("omits the sort param for the default sort but includes a non-default one", () => {
    expect(galleryHref(NO_FILTERS, "longest_waiting")).toBe("/tvaryny?sort=longest_waiting");
  });

  it("round-trips through parseGalleryQuery", () => {
    const filters = withToggledSpecies(withToggledCity(NO_FILTERS, CITY_A), "dog");
    const href = galleryHref(filters, "longest_waiting");
    const reparsed = parseGalleryQuery(Object.fromEntries(new URL(href, "http://x").searchParams));
    expect(reparsed).toEqual({ filters, sort: "longest_waiting", page: 1 });
  });

  it("never carries a page param — a filter change always returns to page 1", () => {
    expect(galleryHref(NO_FILTERS, "freshest")).not.toContain("stor");
  });
});

describe("resetFiltersHref", () => {
  it("clears every filter but keeps the sort", () => {
    expect(resetFiltersHref("longest_waiting")).toBe("/tvaryny?sort=longest_waiting");
  });
});

describe("galleryPageHref", () => {
  it("page 1 has no stor param — matching sort's absent-param-is-default convention", () => {
    expect(galleryPageHref(NO_FILTERS, "freshest", 1)).toBe("/tvaryny");
  });

  it("carries a non-default page as ?stor=N", () => {
    expect(galleryPageHref(NO_FILTERS, "freshest", 3)).toBe("/tvaryny?stor=3");
  });

  it("carries filters and sort forward unchanged, unlike galleryHref", () => {
    const filters = withToggledSpecies(withToggledCity(NO_FILTERS, CITY_A), "dog");
    const href = galleryPageHref(filters, "longest_waiting", 2);
    const reparsed = parseGalleryQuery(Object.fromEntries(new URL(href, "http://x").searchParams));
    expect(reparsed).toEqual({ filters, sort: "longest_waiting", page: 2 });
  });

  it("orders params the same way galleryHref does, stor last", () => {
    expect(galleryPageHref(NO_FILTERS, "longest_waiting", 2)).toBe(
      "/tvaryny?sort=longest_waiting&stor=2",
    );
  });
});

describe("deckEntryHref / parseDeckQuery", () => {
  it("round-trips filters and carries the total through, with no sort/page params at all", () => {
    const filters = withToggledSpecies(withToggledCity(NO_FILTERS, CITY_A), "dog");
    const href = deckEntryHref(filters, 34);

    expect(href).not.toContain("sort=");
    expect(href).not.toContain("stor=");

    const reparsed = parseDeckQuery(Object.fromEntries(new URL(href, "http://x").searchParams));
    expect(reparsed).toEqual({ filters, total: 34 });
  });

  it("an unfiltered gallery produces a bare href with only the total", () => {
    expect(deckEntryHref(NO_FILTERS, 320)).toBe("/tvaryny/gortaty?total=320");
  });

  it("parseDeckQuery falls back to null when total is missing — direct navigation, not a filtered click", () => {
    expect(parseDeckQuery({})).toEqual({ filters: NO_FILTERS, total: null });
  });

  it("parseDeckQuery falls back to null on a garbage total rather than throwing", () => {
    expect(parseDeckQuery({ total: "not-a-number" })).toEqual({ filters: NO_FILTERS, total: null });
  });

  it("parseDeckQuery falls back to null on an implausibly large total — untrusted input, not rendered verbatim", () => {
    expect(parseDeckQuery({ total: "99999999" })).toEqual({ filters: NO_FILTERS, total: null });
  });

  it("parseDeckQuery falls back to null on total=0 — deckEntryHref never produces one, so it's already a stale or hand-edited link", () => {
    expect(parseDeckQuery({ total: "0" })).toEqual({ filters: NO_FILTERS, total: null });
  });

  it("ignores a stray sort/stor param carried over by accident", () => {
    const { filters } = parseDeckQuery({ sort: "longest_waiting", stor: "3", total: "10" });
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
