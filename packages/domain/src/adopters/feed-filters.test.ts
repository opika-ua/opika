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
  it("is false for every value when the selection is any - unlike matchesSelection", () => {
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

    // The alternative - an empty array meaning either "everything" or
    // "nothing" by convention - is the ambiguity this union removes.
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
      temperaments: { kind: "oneOf", values: ["shy"] },
      colours: { kind: "oneOf", values: ["ginger"] },
    };

    const relaxed = relaxDimension(narrow, "sizes");

    expect(relaxed.sizes).toEqual({ kind: "any" });
    expect(relaxed.cities).toEqual(narrow.cities);
    expect(relaxed.species).toEqual(narrow.species);
    expect(relaxed.ages).toEqual(narrow.ages);
    expect(relaxed.coatLengths).toEqual(narrow.coatLengths);
    expect(relaxed.temperaments).toEqual(narrow.temperaments);
    expect(relaxed.colours).toEqual(narrow.colours);
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

/**
 * Temperament and colour (pet card redesign, PR 1b): the sixth and seventh
 * dimensions, built the way fur was. The universes are written out here, not
 * read from `TEMPERAMENT_TRAITS`/`COAT_COLOURS`: a trait added to the domain
 * then turns the "every box ticked" cases red until someone decides it
 * belongs in the collapse, rather than passing against whatever the constant
 * holds.
 */
describe("the temperament and colour dimensions", () => {
  const EVERY_TRAIT = [
    "playful",
    "calm",
    "affectionate",
    "energetic",
    "independent",
    "shy",
    "good_with_kids",
    "good_with_cats",
    "good_with_dogs",
  ] as const;
  const EVERY_COLOUR = [
    "black",
    "white",
    "grey",
    "ginger",
    "brown",
    "cream",
    "black_white",
    "tricolour",
    "tabby",
    "spotted",
  ] as const;

  it("collapses ticking every temperament trait back to any", () => {
    const every: FeedFilters = {
      ...NO_FILTERS,
      temperaments: { kind: "oneOf", values: [...EVERY_TRAIT] },
    };
    expect(canonicalizeFilters(every).temperaments).toEqual({ kind: "any" });
    expect(canonicalizeFilters(every)).toEqual(NO_FILTERS);
    expect(filtersFingerprint(every)).toBe(filtersFingerprint(NO_FILTERS));
  });

  it("collapses ticking every colour back to any", () => {
    const every: FeedFilters = {
      ...NO_FILTERS,
      colours: { kind: "oneOf", values: [...EVERY_COLOUR] },
    };
    expect(canonicalizeFilters(every).colours).toEqual({ kind: "any" });
    expect(canonicalizeFilters(every)).toEqual(NO_FILTERS);
    expect(filtersFingerprint(every)).toBe(filtersFingerprint(NO_FILTERS));
  });

  it("keeps every selection one short of the whole list as a constraint", () => {
    const [, ...eightTraits] = EVERY_TRAIT;
    const [, ...nineColours] = EVERY_COLOUR;
    const narrowed = canonicalizeFilters({
      ...NO_FILTERS,
      temperaments: { kind: "oneOf", values: eightTraits },
      colours: { kind: "oneOf", values: nineColours },
    });
    expect(narrowed.temperaments).toEqual({
      kind: "oneOf",
      values: [...eightTraits].sort(),
    });
    expect(narrowed.colours).toEqual({ kind: "oneOf", values: [...nineColours].sort() });
  });

  it("orders and de-duplicates the chosen traits, so the order ticked never changes the fingerprint", () => {
    const a: FeedFilters = {
      ...NO_FILTERS,
      temperaments: { kind: "oneOf", values: ["shy", "calm", "shy"] },
    };
    const b: FeedFilters = {
      ...NO_FILTERS,
      temperaments: { kind: "oneOf", values: ["calm", "shy"] },
    };
    expect(canonicalizeFilters(a).temperaments).toEqual({
      kind: "oneOf",
      values: ["calm", "shy"],
    });
    expect(filtersFingerprint(a)).toBe(filtersFingerprint(b));
  });

  it("gives a trait and a colour of the same selection their own segments", () => {
    const prints = [
      NO_FILTERS,
      { ...NO_FILTERS, temperaments: { kind: "oneOf", values: ["calm"] } },
      { ...NO_FILTERS, colours: { kind: "oneOf", values: ["black"] } },
      {
        ...NO_FILTERS,
        temperaments: { kind: "oneOf", values: ["calm"] },
        colours: { kind: "oneOf", values: ["black"] },
      },
    ] satisfies FeedFilters[];
    expect(new Set(prints.map(filtersFingerprint)).size).toBe(4);
  });

  it("never reproduces a fingerprint from before the sixth and seventh dimensions", () => {
    // The five-segment form every cursor issued before PR 1b carries, rebuilt
    // by hand from the old rule (cities|species|sizes|ages|coatLengths),
    // never from the current function.
    const legacy = (f: FeedFilters): string => {
      const c = canonicalizeFilters(f);
      const encode = (s: { kind: "any" } | { kind: "oneOf"; values: readonly string[] }) =>
        s.kind === "any" ? "*" : s.values.join(",");
      return [c.cities, c.species, c.sizes, c.ages, c.coatLengths].map(encode).join("|");
    };
    const sets: FeedFilters[] = [
      NO_FILTERS,
      { ...NO_FILTERS, coatLengths: { kind: "oneOf", values: ["long"] } },
      { ...NO_FILTERS, species: { kind: "oneOf", values: ["cat"] } },
      { ...NO_FILTERS, temperaments: { kind: "oneOf", values: ["playful"] } },
      { ...NO_FILTERS, colours: { kind: "oneOf", values: ["tabby"] } },
    ];
    const current = new Set(sets.map(filtersFingerprint));
    for (const set of sets) {
      expect(current.has(legacy(set))).toBe(false);
    }
  });

  it("reads a filter set stored before these dimensions as no temperament or colour filter", () => {
    const stored = {
      cities: { kind: "any" },
      species: { kind: "oneOf", values: ["dog"] },
      sizes: { kind: "any" },
      ages: { kind: "any" },
      coatLengths: { kind: "oneOf", values: ["short"] },
    };
    const parsed = FeedFiltersSchema.parse(stored);
    expect(parsed.temperaments).toEqual({ kind: "any" });
    expect(parsed.colours).toEqual({ kind: "any" });
    expect(parsed.coatLengths).toEqual({ kind: "oneOf", values: ["short"] });
  });

  it("refuses a value outside each closed list, and an empty selection", () => {
    for (const bad of [
      { temperaments: { kind: "oneOf", values: ["grumpy"] } },
      { temperaments: { kind: "oneOf", values: [] } },
      { colours: { kind: "oneOf", values: ["smoky"] } },
      { colours: { kind: "oneOf", values: [] } },
    ]) {
      expect(
        FeedFiltersSchema.safeParse({ ...NO_FILTERS, ...bad }).success,
        JSON.stringify(bad),
      ).toBe(false);
    }
  });

  it("relaxes each of the two like any other dimension", () => {
    const narrow: FeedFilters = {
      ...NO_FILTERS,
      temperaments: { kind: "oneOf", values: ["energetic"] },
      colours: { kind: "oneOf", values: ["white"] },
    };
    expect(relaxDimension(narrow, "temperaments")).toEqual({
      ...narrow,
      temperaments: { kind: "any" },
    });
    expect(relaxDimension(narrow, "colours")).toEqual({ ...narrow, colours: { kind: "any" } });
    expect(isConstrained(narrow, "temperaments")).toBe(true);
    expect(isConstrained(narrow, "colours")).toBe(true);
    expect(FEED_FILTER_DIMENSIONS).toEqual(expect.arrayContaining(["temperaments", "colours"]));
  });
});
