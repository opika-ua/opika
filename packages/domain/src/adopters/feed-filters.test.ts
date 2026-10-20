import { describe, expect, it } from "vitest";
import { CityIdSchema } from "../primitives/ids";
import {
  canonicalizeFilters,
  FEED_FILTER_DIMENSIONS,
  type FeedFilters,
  FeedFiltersSchema,
  filtersFingerprint,
  isConstrained,
  isExplicitlySelected,
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

describe("isExplicitlySelected", () => {
  it("is false for every value when the selection is any — unlike matchesSelection", () => {
    // The bug this function exists to prevent: a filter-UI checkbox reusing
    // matchesSelection would render every option checked the moment nothing
    // is filtered, since matchesSelection's "any admits everything" is
    // correct for querying and wrong for "what did the adopter pick."
    expect(isExplicitlySelected({ kind: "any" }, "dog")).toBe(false);
    expect(isExplicitlySelected({ kind: "any" }, "cat")).toBe(false);
  });

  it("is true only for a listed value", () => {
    const selection = { kind: "oneOf", values: ["dog", "cat"] } as const;
    expect(isExplicitlySelected(selection, "dog")).toBe(true);
    expect(isExplicitlySelected(selection, "cat")).toBe(true);
  });

  it("is false for an unlisted value", () => {
    expect(isExplicitlySelected({ kind: "oneOf", values: ["dog"] }, "cat")).toBe(false);
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
      coatLengths: { kind: "oneOf", values: ["long"] },
    };

    const relaxed = relaxDimension(narrow, "sizes");

    expect(relaxed.sizes).toEqual({ kind: "any" });
    expect(relaxed.cities).toEqual(narrow.cities);
    expect(relaxed.species).toEqual(narrow.species);
    expect(relaxed.ages).toEqual(narrow.ages);
    expect(relaxed.coatLengths).toEqual(narrow.coatLengths);
  });

  it("does not mutate the filters it relaxes", () => {
    const dogs: FeedFilters = { ...NO_FILTERS, species: { kind: "oneOf", values: ["dog"] } };
    relaxDimension(dogs, "species");
    expect(dogs.species).toEqual({ kind: "oneOf", values: ["dog"] });
  });
});

describe("the fur dimension (DR1, S2)", () => {
  const furOnly = (values: readonly ["short" | "long", ...("short" | "long")[]]): FeedFilters => ({
    ...NO_FILTERS,
    coatLengths: { kind: "oneOf", values },
  });

  it("collapses picking both fur lengths back to any", () => {
    expect(canonicalizeFilters(furOnly(["long", "short"])).coatLengths).toEqual({ kind: "any" });
    expect(filtersFingerprint(furOnly(["short", "long"]))).toBe(filtersFingerprint(NO_FILTERS));
  });

  it("keeps a single fur length as a constraint", () => {
    expect(canonicalizeFilters(furOnly(["long"])).coatLengths).toEqual({
      kind: "oneOf",
      values: ["long"],
    });
    expect(isUnfiltered(furOnly(["long"]))).toBe(false);
    expect(isConstrained(furOnly(["short"]), "coatLengths")).toBe(true);
  });

  it("gives each fur selection its own fingerprint", () => {
    const prints = [NO_FILTERS, furOnly(["short"]), furOnly(["long"])].map(filtersFingerprint);
    expect(new Set(prints).size).toBe(3);
  });

  it("never reproduces a fingerprint from before the fifth dimension", () => {
    // The four-segment form every cursor issued before S2 carries. Rebuilt by
    // hand from the old rule (cities|species|sizes|ages), never from the
    // current function, so a fingerprint that dropped the fur segment again
    // would collide here.
    const legacy = (f: FeedFilters): string => {
      const c = canonicalizeFilters(f);
      const encode = (s: { kind: "any" } | { kind: "oneOf"; values: readonly string[] }) =>
        s.kind === "any" ? "*" : s.values.join(",");
      return [c.cities, c.species, c.sizes, c.ages].map(encode).join("|");
    };
    const sets: FeedFilters[] = [
      NO_FILTERS,
      { ...NO_FILTERS, cities: { kind: "oneOf", values: [KHARKIV, POLTAVA] } },
      { ...NO_FILTERS, species: { kind: "oneOf", values: ["dog"] } },
      {
        ...NO_FILTERS,
        sizes: { kind: "oneOf", values: ["large"] },
        ages: { kind: "oneOf", values: ["senior"] },
      },
      furOnly(["long"]),
    ];
    const current = new Set(sets.map(filtersFingerprint));
    for (const set of sets) {
      expect(current.has(legacy(set))).toBe(false);
    }
  });

  it("reads a filter set stored before the fifth dimension as no fur filter", () => {
    const stored = {
      cities: { kind: "any" },
      species: { kind: "oneOf", values: ["cat"] },
      sizes: { kind: "any" },
      ages: { kind: "any" },
    };
    const parsed = FeedFiltersSchema.parse(stored);
    expect(parsed.coatLengths).toEqual({ kind: "any" });
    expect(parsed.species).toEqual({ kind: "oneOf", values: ["cat"] });
  });

  it("refuses a fur value outside the two buckets and an empty fur selection", () => {
    expect(
      FeedFiltersSchema.safeParse({
        ...NO_FILTERS,
        coatLengths: { kind: "oneOf", values: ["wire"] },
      }).success,
    ).toBe(false);
    expect(
      FeedFiltersSchema.safeParse({ ...NO_FILTERS, coatLengths: { kind: "oneOf", values: [] } })
        .success,
    ).toBe(false);
  });

  it("relaxes the fur dimension like any other", () => {
    const narrow: FeedFilters = {
      ...furOnly(["short"]),
      sizes: { kind: "oneOf", values: ["small"] },
    };
    const relaxed = relaxDimension(narrow, "coatLengths");
    expect(relaxed.coatLengths).toEqual({ kind: "any" });
    expect(relaxed.sizes).toEqual(narrow.sizes);
    expect(FEED_FILTER_DIMENSIONS).toContain("coatLengths");
  });
});
