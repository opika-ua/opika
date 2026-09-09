import { DEFAULT_FRESHNESS_POLICY, freshnessOf, isDiscoverable } from "@opika/domain";
import { describe, expect, it } from "vitest";
import { buildAnimals, buildCities, buildShelters, NOW } from "../src/seed";

const LONG_SHELTER_NAME_MIN_CHARS = 40;
// Same threshold apps/web/test/harness/site-header.harness.ts's "a name long
// enough to need it exists in the corpus" uses — kept in sync deliberately,
// not copied by coincidence.
const LONG_ANIMAL_NAME_MIN_CHARS = 25;

/**
 * D-4, 2026-09-06 (docs/build-plan.md, Phase D reprioritisation): the
 * hostile-corpus guarantees are deliberate single instances, not
 * statistical presence — these tests are what makes them a limit rather
 * than a hope, per `docs/standing-constraints.md`'s "a documented limit
 * with no test exercising it is not a limit." Runs the real generation
 * functions directly (no database), so it's fast and doesn't depend on
 * the dev DB having been seeded recently.
 */
describe("seed corpus — D-4 hostile cases", () => {
  const cities = buildCities();
  const shelters = buildShelters(cities);
  const animalRecords = buildAnimals(shelters, cities, 320);
  const animals = animalRecords.map((r) => r.animal);

  describe("built for D-4, 2026-09-06", () => {
    it("has exactly one unregistered_initiative shelter alongside registered ones", () => {
      const kinds = shelters.map((s) => s.legalEntity.kind);
      expect(kinds.filter((k) => k === "unregistered_initiative")).toHaveLength(1);
      expect(kinds.filter((k) => k === "registered_ngo").length).toBeGreaterThan(0);
    });

    it("has at least one published (non-draft) animal with zero photos", () => {
      const match = animals.find((a) => a.photos.length === 0 && a.listing.kind !== "draft");
      expect(match).toBeDefined();
    });

    it("has at least one animal with six photos", () => {
      const match = animals.find((a) => a.photos.length === 6);
      expect(match).toBeDefined();
    });

    it("has at least one animal with a minimal, non-pool description", () => {
      const match = animals.find((a) => a.description.uk === "Опис відсутній.");
      expect(match).toBeDefined();
    });

    /**
     * Real, reachable via the gallery's actual `?misto=` city filter — not
     * an invented mechanism. Verified against the real seeded database
     * during review (city index 4, Вишгород) before this test was written;
     * this pins it so a future change to the freshness formula or the
     * per-city animal counts can't silently break it without a red test.
     *
     * Matches the real feed predicate (`packages/db/src/repos/feed-
     * predicate.ts`), not a stand-in: discoverable listing kinds
     * (`isDiscoverable` — published + reserved, `@opika/domain`) under a
     * *verified* shelter — a long-name or non-verified shelter's animals
     * would never reach this page at all. Uses `cityId` straight off
     * `buildAnimals`'s own return value (the same field the real feed
     * query filters on) rather than re-deriving it from
     * shelter/foster location, which is a second source of truth for a
     * fact the generator already computed once.
     */
    it("has a city where discoverable animals span all three freshness pip states on one page", () => {
      const vyshhorod = cities.at(4);
      expect(vyshhorod).toBeDefined();
      if (!vyshhorod) throw new Error("unreachable");
      expect(vyshhorod.name.uk).toBe("Вишгород");

      const verifiedShelterIds = new Set(
        shelters.filter((s) => s.verification.status === "verified").map((s) => s.id),
      );
      const discoverableInCity = animalRecords.filter(
        (r) =>
          r.cityId === vyshhorod.id &&
          isDiscoverable(r.animal.listing) &&
          verifiedShelterIds.has(r.animal.shelterId),
      );

      expect(discoverableInCity.length).toBeGreaterThan(0);
      expect(discoverableInCity.length).toBeLessThanOrEqual(24); // one gallery page

      const kinds = new Set(
        discoverableInCity.map(
          (r) => freshnessOf(r.animal.lastUpdatedAt, NOW, DEFAULT_FRESHNESS_POLICY).kind,
        ),
      );
      expect(kinds.has("fresh")).toBe(true);
      expect(kinds.has("aging")).toBe(true);
      expect(kinds.has("stale")).toBe(true);
    });
  });

  /**
   * Already true before D-4 touched this file — audited, not built, and
   * pinned here for the first time (review finding: these had no test
   * anywhere, seed-data-only or harness). Each is the corpus-level fact;
   * whether the UI renders each one correctly is a separate, larger claim
   * this file doesn't make.
   */
  describe("already true, audited and pinned by D-4 rather than newly built", () => {
    it("has at least one shelter with no freshness sentence", () => {
      expect(shelters.some((s) => s.freshnessSentence === null)).toBe(true);
    });

    it("has at least one shelter with no donation link", () => {
      expect(shelters.some((s) => s.donation === null)).toBe(true);
    });

    it("has at least one animal with unknown vaccination status", () => {
      expect(animals.some((a) => a.vaccination.state === "unknown")).toBe(true);
    });

    it(`has a shelter name at least ${LONG_SHELTER_NAME_MIN_CHARS} characters long`, () => {
      expect(shelters.some((s) => s.displayName.length >= LONG_SHELTER_NAME_MIN_CHARS)).toBe(true);
    });

    it(`has an animal name at least ${LONG_ANIMAL_NAME_MIN_CHARS} characters long`, () => {
      expect(animals.some((a) => a.name.length >= LONG_ANIMAL_NAME_MIN_CHARS)).toBe(true);
    });
  });
});
