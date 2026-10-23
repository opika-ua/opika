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
import { AnimalDetailViewSchema, FeedCardViewSchema } from "./animal";
import { AdopterViewSchema } from "./session";
import { PublicShelterViewSchema, ShelterSummaryViewSchema } from "./shelter";

const AT = new Date("2026-08-05T00:00:00.000Z");

const animal: Animal = {
  id: AnimalIdSchema.parse("cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
  shelterId: ShelterIdSchema.parse("dddddddd-dddd-4ddd-8ddd-dddddddddddd"),
  name: "Мурчик",
  species: "cat",
  sex: "male",
  coatLength: "long",
  size: "small",
  age: { kind: "declared_bucket", bucket: "young", declaredAt: AT },
  description: { uk: "Лагідний кіт", en: null },
  photos: [{ storageKey: "a/1.jpg", width: 1200, height: 900, alt: null }],
  vaccination: { source: "shelter_declared", state: "confirmed", declaredAt: AT },
  spayNeuter: { source: "shelter_declared", state: "confirmed", declaredAt: AT },
  documentReadiness: { kind: "unknown" },
  listing: { kind: "published", publishedAt: AT, confirmedAt: AT, undoable: null },
  publicLocation: null,
  createdAt: AT,
  lastUpdatedAt: AT,
  version: 0,
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
  freshnessSentence: null,
  verification: "verified",
};

const derived = {
  ageBucket: "young",
  freshness: freshnessOf(AT, AT, DEFAULT_FRESHNESS_POLICY),
  listingKind: "published" as const,
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
      "coatLength",
      "freshness",
      "id",
      "listingKind",
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
      "coatLength",
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

  it("both public views carry unrecorded fur as null, never dropped or invented (DR1-D10)", () => {
    const unrecorded = { ...animal, coatLength: null };
    expect(
      FeedCardViewSchema.parse({
        ...unrecorded,
        ...derived,
        primaryPhoto: null,
        shelter: shelterSummary,
      }).coatLength,
    ).toBeNull();
    expect(
      AnimalDetailViewSchema.parse({ ...unrecorded, ...derived, shelter: shelterSummary })
        .coatLength,
    ).toBeNull();
    expect(
      FeedCardViewSchema.safeParse({
        ...animal,
        coatLength: undefined,
        ...derived,
        primaryPhoto: null,
        shelter: shelterSummary,
      }).success,
    ).toBe(false);
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

/**
 * Oleksii, 2026-10-14 (EM-Q10): before a reveal an adopter receives the city
 * only. The inputs carry a real district and a fuzzed point, so these can't
 * pass merely because the fields were null.
 */
describe("public location is the city only (EM-Q10)", () => {
  const district = { uk: "Шевченківський", en: null };
  const fuzzedShelterSummary = {
    ...shelterSummary,
    publicLocation: { ...shelterSummary.publicLocation, district },
  };

  it("a fostered animal's location parses down to its city", () => {
    const fosteredAnimal: Animal = {
      ...animal,
      publicLocation: {
        precision: "city",
        cityId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as never,
        district,
      },
    };

    for (const parsed of [
      FeedCardViewSchema.parse({
        ...fosteredAnimal,
        ...derived,
        primaryPhoto: null,
        shelter: fuzzedShelterSummary,
      }),
      AnimalDetailViewSchema.parse({
        ...fosteredAnimal,
        ...derived,
        shelter: fuzzedShelterSummary,
      }),
    ]) {
      expect(parsed.publicLocation).toEqual({ cityId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" });
      expect(parsed.shelter.publicLocation).toEqual({
        cityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      });
      const json = JSON.stringify(parsed);
      expect(json).not.toContain("Шевченківський");
      expect(json).not.toContain("49.99");
      expect(json).not.toContain("precision");
    }
  });

  it("a shelter's fuzzed-address location parses down to its city, point and district gone", () => {
    const summary = ShelterSummaryViewSchema.parse(fuzzedShelterSummary);
    expect(summary.publicLocation).toEqual({ cityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
    const shelter = PublicShelterViewSchema.parse({
      ...fuzzedShelterSummary,
      description: { uk: "Опис", en: null },
      donation: null,
      createdAt: AT,
    });
    expect(shelter.publicLocation).toEqual({ cityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
  });
});

describe("shelter views expose exactly their intended fields", () => {
  it("PublicShelterView", () => {
    expect(Object.keys(PublicShelterViewSchema.shape).sort()).toEqual([
      "createdAt",
      "description",
      "displayName",
      "donation",
      "freshnessSentence",
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
