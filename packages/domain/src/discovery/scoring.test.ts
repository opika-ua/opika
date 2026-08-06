import { describe, expect, it } from "vitest";
import { type FeedFilters, NO_FILTERS } from "../adopters/feed-filters";
import type { Animal } from "../animals/animal";
import { AnimalIdSchema, ShelterIdSchema } from "../primitives/ids";
import { DEFAULT_FRESHNESS_POLICY, freshnessOf } from "./freshness";
import { DEFAULT_SCORING_POLICY, scoreAnimal } from "./scoring";

const NOW = new Date("2026-08-05T12:00:00.000Z");
const daysAgo = (days: number): Date => new Date(NOW.getTime() - days * 86_400_000);

const baseAnimal: Animal = {
  id: AnimalIdSchema.parse("cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
  shelterId: ShelterIdSchema.parse("dddddddd-dddd-4ddd-8ddd-dddddddddddd"),
  name: "Мурчик",
  species: "cat",
  sex: "male",
  size: "small",
  age: { kind: "declared_bucket", bucket: "young", declaredAt: NOW },
  description: { uk: "Лагідний кіт, любить дітей та інших тварин. Привчений до лотка.", en: null },
  photos: [{ storageKey: "a/1.jpg", width: 1200, height: 900, alt: null }],
  vaccination: { source: "shelter_declared", state: "confirmed", declaredAt: NOW },
  spayNeuter: { source: "shelter_declared", state: "confirmed", declaredAt: NOW },
  documentReadiness: { kind: "unknown" },
  listing: { kind: "published", publishedAt: NOW },
  publicLocation: null,
  createdAt: NOW,
  lastUpdatedAt: NOW,
};

const animal = (overrides: Partial<Animal>): Animal => ({ ...baseAnimal, ...overrides });

const scoreAt = (subject: Animal, days: number, filters: FeedFilters = NO_FILTERS): number =>
  scoreAnimal(
    subject,
    filters,
    freshnessOf(daysAgo(days), NOW, DEFAULT_FRESHNESS_POLICY),
    NOW,
    DEFAULT_SCORING_POLICY,
  );

describe("scoreAnimal", () => {
  it("is deterministic", () => {
    expect(scoreAt(baseAnimal, 3)).toBe(scoreAt(baseAnimal, 3));
  });

  it("stays within [0, 1]", () => {
    const candidates = [
      baseAnimal,
      animal({ photos: [], description: { uk: "Кіт", en: null } }),
      animal({ vaccination: { source: "shelter_declared", state: "unknown", declaredAt: NOW } }),
    ];

    for (const candidate of candidates) {
      for (const days of [0, 8, 40]) {
        const score = scoreAt(candidate, days);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }
    }
  });

  it("gives a perfect listing the maximum score", () => {
    expect(scoreAt(baseAnimal, 0)).toBe(1);
  });
});

describe("staleness de-ranking", () => {
  it("ranks fresh above aging above stale, all else equal", () => {
    const fresh = scoreAt(baseAnimal, 1);
    const aging = scoreAt(baseAnimal, 20);
    const stale = scoreAt(baseAnimal, 60);

    expect(fresh).toBeGreaterThan(aging);
    expect(aging).toBeGreaterThan(stale);
  });

  it("pins the default policy, so a weight typo is a test failure", () => {
    // Every assertion below is a relative comparison, which a changed weight
    // survives. Halving hasPhotos reordered the entire feed and passed.
    expect(DEFAULT_SCORING_POLICY).toEqual({
      componentWeights: { freshness: 0.5, completeness: 0.3, preference: 0.2 },
      freshnessScore: { fresh: 1, aging: 0.6, stale: 0.15 },
      completenessScore: { hasPhotos: 0.5, hasDescription: 0.25, vaccinationKnown: 0.25 },
      minDescriptionChars: 40,
    });
  });

  it("produces the exact scores the default policy implies", () => {
    expect(scoreAt(baseAnimal, 20)).toBeCloseTo(0.8, 10);
    expect(scoreAt(baseAnimal, 60)).toBeCloseTo(0.575, 10);
    expect(scoreAt(animal({ photos: [] }), 0)).toBeCloseTo(0.85, 10);
    expect(
      scoreAt(
        animal({ vaccination: { source: "shelter_declared", state: "unknown", declaredAt: NOW } }),
        0,
      ),
    ).toBeCloseTo(0.925, 10);
  });

  it("de-ranks a stale complete listing below a fresh incomplete one", () => {
    // The whole point of the freshness weighting: a listing nobody has
    // confirmed in two months should not outrank one that is current.
    const staleComplete = scoreAt(baseAnimal, 60);
    const freshSparse = scoreAt(animal({ photos: [] }), 0);

    expect(freshSparse).toBeGreaterThan(staleComplete);
  });
});

describe("completeness", () => {
  it("rewards having a photo", () => {
    expect(scoreAt(baseAnimal, 0)).toBeGreaterThan(scoreAt(animal({ photos: [] }), 0));
  });

  it("rewards a description that actually says something", () => {
    // The schema already forbids an empty description, so "length > 0" gave
    // every animal the same credit and a single space earned full marks.
    const terse = animal({ description: { uk: "Кіт", en: null } });
    expect(scoreAt(baseAnimal, 0)).toBeGreaterThan(scoreAt(terse, 0));
  });

  it("does not credit whitespace padded to the threshold", () => {
    const padded = animal({ description: { uk: `Кіт${" ".repeat(60)}`, en: null } });
    const terse = animal({ description: { uk: "Кіт", en: null } });
    expect(scoreAt(padded, 0)).toBe(scoreAt(terse, 0));
  });

  it("rewards a known vaccination state over an unknown one", () => {
    const unknown = animal({
      vaccination: { source: "shelter_declared", state: "unknown", declaredAt: NOW },
    });
    expect(scoreAt(baseAnimal, 0)).toBeGreaterThan(scoreAt(unknown, 0));
  });

  it("does not distinguish a registry confirmation from a declared one in ranking", () => {
    // Provenance changes the badge, not the position. Ranking on it would
    // penalise shelters for the registry's coverage rather than their own data.
    const viaRegistry = animal({
      vaccination: {
        source: "registry",
        state: "confirmed",
        registryRef: "UA-123",
        verifiedAt: NOW,
      },
    });
    expect(scoreAt(viaRegistry, 0)).toBe(scoreAt(baseAnimal, 0));
  });
});

describe("preference component", () => {
  it("scores an unfiltered feed as a full preference match", () => {
    expect(scoreAt(baseAnimal, 0, NO_FILTERS)).toBe(1);
  });

  it("is constant across candidates once filters are applied as hard constraints", () => {
    // Every candidate the query returns already matches, so this component
    // contributes nothing today — the behaviour the comment in scoring.ts
    // warns not to "clean up".
    const filters: FeedFilters = { ...NO_FILTERS, species: { kind: "oneOf", values: ["cat"] } };
    const other = animal({ size: "large" });

    expect(scoreAt(baseAnimal, 0, filters)).toBe(scoreAt(other, 0, filters));
  });

  it("evaluates every filtered dimension, not just some of them", () => {
    // Dropping the sizes dimension from the calculation passed the old suite,
    // because only species and ages were ever exercised.
    const misses: readonly FeedFilters[] = [
      { ...NO_FILTERS, species: { kind: "oneOf", values: ["dog"] } },
      { ...NO_FILTERS, sizes: { kind: "oneOf", values: ["large"] } },
      { ...NO_FILTERS, ages: { kind: "oneOf", values: ["senior"] } },
    ];

    for (const filters of misses) {
      expect(scoreAt(baseAnimal, 0, filters)).toBeLessThan(scoreAt(baseAnimal, 0, NO_FILTERS));
    }
  });

  it("does not lower a score when a filter is widened", () => {
    const narrow: FeedFilters = { ...NO_FILTERS, sizes: { kind: "oneOf", values: ["small"] } };
    expect(scoreAt(baseAnimal, 0, NO_FILTERS)).toBeGreaterThanOrEqual(
      scoreAt(baseAnimal, 0, narrow),
    );
  });

  it("derives the age bucket at scoring time rather than trusting a stored one", () => {
    const puppy = animal({
      age: { kind: "declared_bucket", bucket: "baby", declaredAt: daysAgo(900) },
    });
    const filters: FeedFilters = { ...NO_FILTERS, ages: { kind: "oneOf", values: ["baby"] } };

    // Declared a baby two and a half years ago, so it no longer matches.
    expect(scoreAt(puppy, 0, filters)).toBeLessThan(scoreAt(puppy, 0, NO_FILTERS));
  });
});

describe("policy is honoured", () => {
  it("collapses to freshness alone when the other weights are zero", () => {
    const policy = {
      ...DEFAULT_SCORING_POLICY,
      componentWeights: { freshness: 1, completeness: 0, preference: 0 },
    };
    const sparse = animal({ photos: [], description: { uk: "Кіт", en: null } });

    expect(
      scoreAnimal(sparse, NO_FILTERS, freshnessOf(NOW, NOW, DEFAULT_FRESHNESS_POLICY), NOW, policy),
    ).toBe(1);
  });

  it("uses the tuned freshness scores rather than the defaults", () => {
    const policy = {
      ...DEFAULT_SCORING_POLICY,
      freshnessScore: { fresh: 1, aging: 1, stale: 1 },
    };
    const stale = freshnessOf(daysAgo(90), NOW, DEFAULT_FRESHNESS_POLICY);

    expect(scoreAnimal(baseAnimal, NO_FILTERS, stale, NOW, policy)).toBe(1);
  });
});
