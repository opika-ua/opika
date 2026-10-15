import {
  CityIdSchema,
  EdrpouSchema,
  type ExactAddress,
  type LocationPrivacyPolicy,
  ModeratorIdSchema,
  publicLocationOf,
  type Shelter,
  ShelterIdSchema,
  testOnlyLocationPolicy,
} from "@opika/domain";
import { describe, expect, it } from "vitest";
import { ContactRevealViewSchema } from "./reveal";
import { PublicShelterViewSchema, ShelterSummaryViewSchema } from "./shelter";

const AT = new Date("2026-08-05T00:00:00.000Z");
const SHELTER_ID = ShelterIdSchema.parse("dddddddd-dddd-4ddd-8ddd-dddddddddddd");
const CITY_ID = CityIdSchema.parse("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
const MODERATOR = ModeratorIdSchema.parse("11111111-1111-4111-8111-111111111111");

const contact = {
  primary: { kind: "phone", e164: "+380501234567" },
  additional: [],
} as const;

const exactAddress: ExactAddress = {
  line1: "вул. Прикладна, 1",
  line2: null,
  postalCode: "61000",
  cityId: CITY_ID,
  district: null,
  coordinates: { lat: 49.9935, lng: 36.2304 },
};

const privacyPolicy: LocationPrivacyPolicy = testOnlyLocationPolicy("test-key");

// Not hand-assembled: the branded fuzzed type makes publicLocationOf the only
// way to build this, which is exactly the property under test.
const publicLocation = publicLocationOf(SHELTER_ID, exactAddress, privacyPolicy);

const shelter: Shelter = {
  id: SHELTER_ID,
  displayName: "Тестовий притулок",
  description: { uk: "Опис", en: null },
  legalEntity: {
    kind: "registered_ngo",
    legalName: "Тестовий притулок",
    edrpou: EdrpouSchema.parse("12345678"),
    registeredAt: AT,
  },
  publicLocation,
  exactAddress,
  contact,
  donation: null,
  pendingDonation: null,
  version: 0,
  freshnessSentence: null,
  verification: {
    status: "verified",
    verifiedAt: AT,
    verifiedBy: MODERATOR,
    evidence: { items: [], submittedAt: AT },
  },
  createdAt: AT,
  lastUpdatedAt: AT,
};

describe("public shelter projections withhold the private fields", () => {
  const projected = PublicShelterViewSchema.parse({ ...shelter, verification: "verified" });

  it("does not carry the exact address", () => {
    expect(projected).not.toHaveProperty("exactAddress");
  });

  it("does not carry contact details", () => {
    expect(projected).not.toHaveProperty("contact");
  });

  it("does not carry the legal entity", () => {
    expect(projected).not.toHaveProperty("legalEntity");
  });

  it("reduces verification to a badge, dropping moderators and evidence", () => {
    expect(projected.verification).toBe("verified");
  });

  it("carries the city only: no district, no fuzzed point (EM-Q10)", () => {
    // The domain location still holds the fuzzed point (built server-side by
    // publicLocationOf above); the public view no longer serializes it.
    expect(publicLocation.precision).toBe("fuzzed_address");
    expect(projected.publicLocation).toEqual({ cityId: CITY_ID });
    expect(JSON.stringify(projected)).not.toContain(String(exactAddress.coordinates.lat));
  });

  it("withholds the same fields from the card summary", () => {
    const summary = ShelterSummaryViewSchema.parse({ ...shelter, verification: "verified" });
    expect(summary).not.toHaveProperty("exactAddress");
    expect(summary).not.toHaveProperty("contact");
  });

  /**
   * H2 (N20): a proposed donation link is unapproved by definition, and the
   * live link is the one adopters trust because it was verified. The input
   * carries a real pending link, so this can't pass merely because the field
   * was null.
   */
  it("never carries a pending (unapproved) donation link, in either view", () => {
    const withPending = {
      ...shelter,
      pendingDonation: {
        link: { url: "https://send.monobank.ua/jar/swapped", provider: "monobank_jar" as const },
        proposedAt: AT,
        proposedBy: "44444444-4444-4444-8444-444444444444" as never,
      },
      verification: "verified" as const,
    };
    for (const view of [
      PublicShelterViewSchema.parse(withPending),
      ShelterSummaryViewSchema.parse(withPending),
    ]) {
      expect(view).not.toHaveProperty("pendingDonation");
      expect(JSON.stringify(view)).not.toContain("swapped");
    }
  });
});

describe("the reveal is the one sanctioned path to the contact details, and never to the address", () => {
  /**
   * EM-D1 (Oleksii, 2026-10-15, verbatim: "the exact address never leaves the
   * server for adopters"): the view strips the exact address and the
   * district and point of the public location even when handed them, and
   * keeps the contact channels and the city.
   */
  it("carries the contact and the city, and strips the exact address, district and point", () => {
    const view = ContactRevealViewSchema.parse({
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      animalId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      revealedAt: AT,
      shelterSnapshot: {
        shelterId: SHELTER_ID,
        displayName: shelter.displayName,
        contact,
        exactAddress,
        publicLocation: shelter.publicLocation,
        verificationStatusAtReveal: "verified",
        donation: null,
      },
      animalSnapshot: { name: "Мурчик", primaryPhoto: null },
    });

    expect(view.shelterSnapshot).not.toHaveProperty("exactAddress");
    expect(view.shelterSnapshot.publicLocation).toEqual({ cityId: CITY_ID });
    const json = JSON.stringify(view);
    for (const leaked of ["вул. Прикладна", "61000", '"district"', '"coordinates"', '"lat"']) {
      expect(json, leaked).not.toContain(leaked);
    }
    expect(view.shelterSnapshot.contact.primary).toEqual(contact.primary);
  });

  it("records the verification status as it stood at reveal time", () => {
    // A shelter suspended next month was verified when this adopter was sent
    // to it, and both facts matter when a complaint is investigated.
    const parsed = ContactRevealViewSchema.parse({
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      animalId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      revealedAt: AT,
      shelterSnapshot: {
        shelterId: SHELTER_ID,
        displayName: shelter.displayName,
        contact,
        exactAddress,
        publicLocation: shelter.publicLocation,
        verificationStatusAtReveal: "verified",
        donation: null,
      },
      animalSnapshot: { name: "Мурчик", primaryPhoto: null },
    });

    expect(parsed.shelterSnapshot.verificationStatusAtReveal).toBe("verified");
  });
});
