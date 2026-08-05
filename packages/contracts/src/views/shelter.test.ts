import {
  CityIdSchema,
  EdrpouSchema,
  ModeratorIdSchema,
  type Shelter,
  ShelterIdSchema,
} from "@opika/domain";
import { describe, expect, it } from "vitest";
import { ContactRevealViewSchema } from "./reveal.js";
import { PublicShelterViewSchema, ShelterSummaryViewSchema } from "./shelter.js";

const AT = new Date("2026-08-05T00:00:00.000Z");
const SHELTER_ID = ShelterIdSchema.parse("dddddddd-dddd-4ddd-8ddd-dddddddddddd");
const CITY_ID = CityIdSchema.parse("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
const MODERATOR = ModeratorIdSchema.parse("11111111-1111-4111-8111-111111111111");

const contact = {
  primary: { kind: "phone", e164: "+380501234567" },
  additional: [],
} as const;

const exactAddress = {
  line1: "вул. Прикладна, 1",
  line2: null,
  postalCode: "61000",
  cityId: CITY_ID,
  district: null,
  coordinates: { lat: 49.9935, lng: 36.2304 },
} as const;

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
  publicLocation: {
    cityId: CITY_ID,
    district: null,
    approximate: { center: { lat: 49.99, lng: 36.23 }, precisionMetres: 1000 },
  },
  exactAddress,
  contact,
  donation: null,
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

  it("still carries the approximate location, which is what a map needs", () => {
    expect(projected.publicLocation.approximate.precisionMetres).toBe(1000);
  });

  it("withholds the same fields from the card summary", () => {
    const summary = ShelterSummaryViewSchema.parse({ ...shelter, verification: "verified" });
    expect(summary).not.toHaveProperty("exactAddress");
    expect(summary).not.toHaveProperty("contact");
  });
});

describe("the reveal is the one sanctioned path to the private fields", () => {
  it("carries the exact address and contact inside the snapshot", () => {
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

    expect(view.shelterSnapshot.exactAddress.line1).toBe("вул. Прикладна, 1");
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
