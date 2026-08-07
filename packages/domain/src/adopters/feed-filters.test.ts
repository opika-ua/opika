import { describe, expect, it } from "vitest";
import { CityIdSchema } from "../primitives/ids";
import {
  canonicalizeFilters,
  FEED_FILTER_DIMENSIONS,
  type FeedFilters,
  FeedFiltersSchema,
  filtersFingerprint,
  isConstrained,
  isUnfiltered,
  matchesSelection,
  NO_FILTERS,
  relaxDimension,
} from "./feed-filters";

const KHARKIV = CityIdSchema.parse("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
const POLTAVA = CityIdSchema.parse("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");

describe("matchesSelection", () => {
  it("admits everything when the selection is any", () => {
    expect(matchesSelection({ kind: "any" }, "dog")).toBe(true);
  });

  it("admits a listed value", () => {
    expect(matchesSelection({ kind: "oneOf", values: ["dog", "cat"] }, "cat")).toBe(true);
  });

  it("excludes an unlisted value", () => {
    expect(matchesSelection({ kind: "oneOf", values: ["dog"] }, "cat")).toBe(false);
  });
});

describe("an empty selection is unrepresentable", () => {
  it("is rejected at parse time", () => {
    const result = FeedFiltersSchema.safeParse({
      ...NO_FILTERS,
      species: { kind: "oneOf", values: [] },
    });

    // The alternative — an empty array meaning either "everything" or
    // "nothing" by convention — is the ambiguity this union removes.
    expect(result.success).toBe(false);
  });

  it("accepts a selection with one value", () => {
    const result = FeedFiltersSchema.safeParse({
      ...NO_FILTERS,
      species: { kind: "oneOf", values: ["dog"] },
    });
    expect(result.success).toBe(true);
  });
});

describe("canonicalizeFilters", () => {
  it("orders values so equivalent filters serialise identically", () => {
    const a: FeedFilters = { ...NO_FILTERS, cities: { kind: "oneOf", values: [POLTAVA, KHARKIV] } };
    const b: FeedFilters = { ...NO_FILTERS, cities: { kind: "oneOf", values: [KHARKIV, POLTAVA] } };

    // A cursor issued against one must keep matching the other, or the feed
    // silently restarts when a filter sheet re-renders in a different order.
    expect(canonicalizeFilters(a)).toEqual(canonicalizeFilters(b));
  });

  it("removes duplicates", () => {
    const filters: FeedFilters = {
      ...NO_FILTERS,
      sizes: { kind: "oneOf", values: ["small", "small", "large"] },
    };
    expect(canonicalizeFilters(filters).sizes).toEqual({
      kind: "oneOf",
      values: ["large", "small"],
    });
  });

  it("collapses an exhaustive selection back to any", () => {
    // Ticking every box means the same thing as ticking none. Two encodings of
    // one question is exactly the cursor mismatch this function prevents.
    const everySpecies: FeedFilters = {
      ...NO_FILTERS,
      species: { kind: "oneOf", values: ["dog", "cat"] },
    };
    expect(canonicalizeFilters(everySpecies)).toEqual(NO_FILTERS);
    expect(isUnfiltered(canonicalizeFilters(everySpecies))).toBe(true);
  });

  it("does not collapse a partial selection", () => {
    const oneSpecies: FeedFilters = { ...NO_FILTERS, species: { kind: "oneOf", values: ["dog"] } };
    expect(canonicalizeFilters(oneSpecies).species).toEqual({ kind: "oneOf", values: ["dog"] });
  });

  it("cannot collapse cities, whose universe is data rather than a type", () => {
    const cities: FeedFilters = { ...NO_FILTERS, cities: { kind: "oneOf", values: [KHARKIV] } };
    expect(canonicalizeFilters(cities).cities).toEqual({ kind: "oneOf", values: [KHARKIV] });
  });

  it("leaves an unconstrained selection alone", () => {
    expect(canonicalizeFilters(NO_FILTERS)).toEqual(NO_FILTERS);
  });

  it("is idempotent", () => {
    const filters: FeedFilters = {
      ...NO_FILTERS,
      ages: { kind: "oneOf", values: ["senior", "baby"] },
    };
    const once = canonicalizeFilters(filters);
    expect(canonicalizeFilters(once)).toEqual(once);
  });
});

describe("isUnfiltered", () => {
  it("is true when nothing is constrained", () => {
    expect(isUnfiltered(NO_FILTERS)).toBe(true);
  });

  it("is false when any dimension is constrained", () => {
    expect(isUnfiltered({ ...NO_FILTERS, species: { kind: "oneOf", values: ["dog"] } })).toBe(
      false,
    );
  });
});

describe("filtersFingerprint", () => {
  it("matches for two filter sets that mean the same thing", () => {
    const a: FeedFilters = { ...NO_FILTERS, cities: { kind: "oneOf", values: [POLTAVA, KHARKIV] } };
    const b: FeedFilters = { ...NO_FILTERS, cities: { kind: "oneOf", values: [KHARKIV, POLTAVA] } };
    expect(filtersFingerprint(a)).toBe(filtersFingerprint(b));
  });

  it("treats an exhaustive selection as unfiltered", () => {
    const every: FeedFilters = {
      ...NO_FILTERS,
      sizes: { kind: "oneOf", values: ["small", "medium", "large"] },
    };
    expect(filtersFingerprint(every)).toBe(filtersFingerprint(NO_FILTERS));
  });

  it("differs when the filters differ", () => {
    const dogs: FeedFilters = { ...NO_FILTERS, species: { kind: "oneOf", values: ["dog"] } };
    expect(filtersFingerprint(dogs)).not.toBe(filtersFingerprint(NO_FILTERS));
  });

  it("distinguishes the dimension a value came from", () => {
    // A fingerprint that concatenated values without separators would collide.
    const bySize: FeedFilters = { ...NO_FILTERS, sizes: { kind: "oneOf", values: ["small"] } };
    const byAge: FeedFilters = { ...NO_FILTERS, ages: { kind: "oneOf", values: ["baby"] } };
    expect(filtersFingerprint(bySize)).not.toBe(filtersFingerprint(byAge));
  });
});

describe("filter dimensions", () => {
  it("names every dimension the filter schema actually has", () => {
    // Derived from the schema, so a fifth filter cannot be added while the
    // relaxation suggestions keep covering only four.
    expect([...FEED_FILTER_DIMENSIONS].sort()).toEqual(Object.keys(NO_FILTERS).sort());
  });

  it("reports which dimensions are constrained", () => {
    const dogs: FeedFilters = { ...NO_FILTERS, species: { kind: "oneOf", values: ["dog"] } };

    expect(isConstrained(dogs, "species")).toBe(true);
    expect(isConstrained(dogs, "sizes")).toBe(false);
  });

  it("relaxes exactly one dimension and leaves the rest alone", () => {
    const narrow: FeedFilters = {
      cities: { kind: "oneOf", values: [KHARKIV] },
      species: { kind: "oneOf", values: ["dog"] },
      sizes: { kind: "oneOf", values: ["small"] },
      ages: { kind: "oneOf", values: ["baby"] },
    };

    const relaxed = relaxDimension(narrow, "sizes");

    expect(relaxed.sizes).toEqual({ kind: "any" });
    expect(relaxed.cities).toEqual(narrow.cities);
    expect(relaxed.species).toEqual(narrow.species);
    expect(relaxed.ages).toEqual(narrow.ages);
  });

  it("does not mutate the filters it relaxes", () => {
    const dogs: FeedFilters = { ...NO_FILTERS, species: { kind: "oneOf", values: ["dog"] } };
    relaxDimension(dogs, "species");
    expect(dogs.species).toEqual({ kind: "oneOf", values: ["dog"] });
  });
});
