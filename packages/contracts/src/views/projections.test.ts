import {
  AccountIdSchema,
  AdopterIdSchema,
  type AdopterProfile,
  type Animal,
  AnimalIdSchema,
  CountryCodeSchema,
  DEFAULT_FRESHNESS_POLICY,
  freshnessOf,
  ShelterIdSchema,
} from "@opika/domain";
import { describe, expect, it } from "vitest";
import { AnimalDetailViewSchema, FeedCardViewSchema } from "./animal.js";
import { AdopterViewSchema } from "./session.js";
import { PublicShelterViewSchema, ShelterSummaryViewSchema } from "./shelter.js";

const AT = new Date("2026-08-05T00:00:00.000Z");

const animal: Animal = {
  id: AnimalIdSchema.parse("cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
  shelterId: ShelterIdSchema.parse("dddddddd-dddd-4ddd-8ddd-dddddddddddd"),
  name: "Мурчик",
  species: "cat",
  sex: "male",
  size: "small",
  age: { kind: "declared_bucket", bucket: "young", declaredAt: AT },
  description: { uk: "Лагідний кіт", en: null },
  photos: [{ storageKey: "a/1.jpg", width: 1200, height: 900, alt: null }],
  vaccination: { source: "shelter_declared", state: "confirmed", declaredAt: AT },
  spayNeuter: { source: "shelter_declared", state: "confirmed", declaredAt: AT },
  documentReadiness: { kind: "unknown" },
  listing: { kind: "published", publishedAt: AT },
  publicLocation: null,
  createdAt: AT,
  lastUpdatedAt: AT,
};

const shelterSummary = {
  id: animal.shelterId,
  displayName: "Тестовий притулок",
  publicLocation: {
    precision: "fuzzed_address",
    cityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    district: null,
    approximate: { center: { lat: 49.99, lng: 36.23 }, precisionMetres: 1000 },
  },
  verification: "verified",
};

const derived = {
  ageBucket: "young",
  freshness: freshnessOf(AT, AT, DEFAULT_FRESHNESS_POLICY),
};

/**
 * These assert the exact key set, not merely that a few fields are absent.
 *
 * Asserting absence alone lets the surface drift in both directions: a field
 * added to the pick ships silently, and a field removed from it breaks clients
 * silently. Both of those escaped the previous suite.
 */
describe("animal views expose exactly their intended fields", () => {
  it("FeedCardView", () => {
    const parsed = FeedCardViewSchema.parse({
      ...animal,
      ...derived,
      primaryPhoto: animal.photos[0] ?? null,
      shelter: shelterSummary,
    });

    expect(Object.keys(parsed).sort()).toEqual([
      "ageBucket",
      "freshness",
      "id",
      "name",
      "primaryPhoto",
      "publicLocation",
      "sex",
      "shelter",
      "size",
      "species",
    ]);
  });

  it("AnimalDetailView", () => {
    const parsed = AnimalDetailViewSchema.parse({
      ...animal,
      ...derived,
      shelter: shelterSummary,
    });

    expect(Object.keys(parsed).sort()).toEqual([
      "ageBucket",
      "description",
      "documentReadiness",
      "freshness",
      "id",
      "name",
      "photos",
      "publicLocation",
      "sex",
      "shelter",
      "size",
      "spayNeuter",
      "species",
      "vaccination",
    ]);
  });

  it("never ships the raw age estimate or lastUpdatedAt", () => {
    // The client has no trustworthy clock. Sending the inputs rather than the
    // derived values would let a wrong device date render a stale listing as
    // fresh, or a senior animal as a puppy — which is the entire reason these
    // two fields are computed server-side.
    for (const parsed of [
      FeedCardViewSchema.parse({
        ...animal,
        ...derived,
        primaryPhoto: null,
        shelter: shelterSummary,
      }),
      AnimalDetailViewSchema.parse({ ...animal, ...derived, shelter: shelterSummary }),
    ]) {
      expect(parsed).not.toHaveProperty("age");
      expect(parsed).not.toHaveProperty("lastUpdatedAt");
      expect(parsed).not.toHaveProperty("createdAt");
      expect(parsed).not.toHaveProperty("listing");
      expect(parsed).not.toHaveProperty("shelterId");
    }
  });
});

describe("public location precision", () => {
  it("a fostered animal's city-precision location carries no coordinates", () => {
    const fosteredAnimal: Animal = {
      ...animal,
      publicLocation: {
        precision: "city",
        cityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as never,
        district: null,
      },
    };

    for (const parsed of [
      FeedCardViewSchema.parse({
        ...fosteredAnimal,
        ...derived,
        primaryPhoto: null,
        shelter: shelterSummary,
      }),
      AnimalDetailViewSchema.parse({ ...fosteredAnimal, ...derived, shelter: shelterSummary }),
    ]) {
      expect(parsed.publicLocation?.precision).toBe("city");
      expect(JSON.stringify(parsed.publicLocation)).not.toContain("approximate");
      expect(JSON.stringify(parsed.publicLocation)).not.toContain("center");
    }
  });

  it("a shelter's fuzzed-address location still carries coordinates", () => {
    expect(shelterSummary.publicLocation.precision).toBe("fuzzed_address");
    const summary = ShelterSummaryViewSchema.parse({ ...shelterSummary });
    expect(summary.publicLocation.precision).toBe("fuzzed_address");
    if (summary.publicLocation.precision === "fuzzed_address") {
      expect(summary.publicLocation.approximate.center).toBeDefined();
      expect(summary.publicLocation.approximate.precisionMetres).toBe(1000);
    }
  });
});

describe("shelter views expose exactly their intended fields", () => {
  it("PublicShelterView", () => {
    expect(Object.keys(PublicShelterViewSchema.shape).sort()).toEqual([
      "createdAt",
      "description",
      "displayName",
      "donation",
      "id",
      "publicLocation",
      "verification",
    ]);
  });

  it("ShelterSummaryView", () => {
    expect(Object.keys(ShelterSummaryViewSchema.shape).sort()).toEqual([
      "displayName",
      "id",
      "publicLocation",
      "verification",
    ]);
  });
});

describe("the adopter view cannot carry an identity", () => {
  const profile: AdopterProfile = {
    id: AdopterIdSchema.parse("11111111-1111-4111-8111-111111111111"),
    identity: {
      kind: "account",
      accountId: AccountIdSchema.parse("22222222-2222-4222-8222-222222222222"),
      email: "adopter@example.com",
    },
    country: CountryCodeSchema.parse("UA"),
    preferredLocale: "uk",
    savedFilters: null,
    createdAt: AT,
  };

  it("strips identity entirely", () => {
    const parsed = AdopterViewSchema.parse({ ...profile, isAnonymous: false });
    expect(parsed).not.toHaveProperty("identity");
    expect(Object.keys(parsed).sort()).toEqual(["country", "id", "isAnonymous", "preferredLocale"]);
  });

  it("does not leak the email anywhere in the serialised payload", () => {
    // A key-set assertion would miss it being nested inside another field.
    const parsed = AdopterViewSchema.parse({ ...profile, isAnonymous: false });
    expect(JSON.stringify(parsed)).not.toContain("adopter@example.com");
  });
});
