import { describe, expect, it } from "vitest";
import { CityIdSchema } from "../primitives/ids.js";
import {
  canonicalizeFilters,
  type FeedFilters,
  FeedFiltersSchema,
  isUnfiltered,
  matchesSelection,
  NO_FILTERS,
} from "./feed-filters.js";

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
