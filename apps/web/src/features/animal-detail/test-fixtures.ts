import type { AnimalDetailView, CityView, PublicShelterView } from "@opika/contracts";
import { ORPCError } from "@orpc/server";
import { vi } from "vitest";
import type { AnimalPageClient } from "./animal-page-load";

/**
 * Fixtures for the animal page's loader and both of its surfaces (the full
 * page and the gallery's overlay), so a test of either builds the same
 * animal, the same shelter and the same stubbed client.
 */

export const ANIMAL_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
export const SHELTER_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
export const CITY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AT = new Date("2026-09-01T00:00:00.000Z");

export function makeDetailAnimal(overrides: Partial<AnimalDetailView> = {}): AnimalDetailView {
  return {
    id: ANIMAL_ID as AnimalDetailView["id"],
    name: "Мурчик",
    species: "cat",
    sex: "male",
    size: "small",
    coatLength: "long",
    publicLocation: null,
    description: { uk: "Лагідний кіт, любить сидіти на підвіконні.", en: null },
    photos: [
      { storageKey: "/a.jpg", width: 1200, height: 900, alt: null },
      { storageKey: "/b.jpg", width: 1200, height: 900, alt: null },
    ],
    vaccination: { source: "shelter_declared", state: "confirmed", declaredAt: AT },
    spayNeuter: { source: "shelter_declared", state: "confirmed", declaredAt: AT },
    documentReadiness: { kind: "unknown" },
    temperament: [],
    colour: null,
    medicalNotes: null,
    ageBucket: "young",
    freshness: { kind: "aging", confirmedAt: AT, ageDays: 5 },
    shelter: {
      id: SHELTER_ID as AnimalDetailView["shelter"]["id"],
      displayName: "Тестовий притулок «Домівка»",
      logo: null,
      publicLocation: { cityId: CITY_ID as never },
      verification: "verified",
    },
    ...overrides,
  };
}

export function makeDetailShelter(overrides: Partial<PublicShelterView> = {}): PublicShelterView {
  return {
    id: SHELTER_ID as PublicShelterView["id"],
    displayName: "Тестовий притулок «Домівка»",
    description: { uk: "Опис притулку", en: null },
    publicLocation: { cityId: CITY_ID as never },
    donation: { url: "https://pay.example.org/domivka", provider: "monobank_jar" },
    logo: null,
    createdAt: new Date("2023-01-01T00:00:00.000Z"),
    freshnessSentence: null,
    verification: "verified",
    ...overrides,
  };
}

const CITY: CityView = {
  id: CITY_ID as CityView["id"],
  slug: "brovary" as CityView["slug"],
  name: { uk: "Бровари", en: { text: "Brovary", provenance: "human" } },
};

/** What `animals.byId` does in a test: answer, or refuse with an oRPC code, or fail outright. */
export type ByIdBehaviour =
  | { kind: "answer"; animal?: AnimalDetailView }
  | { kind: "refuse"; code: "NOT_FOUND" | "RATE_LIMITED" }
  | { kind: "fail" };

export function stubAnimalPageClient(byId: ByIdBehaviour = { kind: "answer" }) {
  const animalsById = vi.fn(async () => {
    switch (byId.kind) {
      case "answer":
        return byId.animal ?? makeDetailAnimal();
      case "refuse":
        throw new ORPCError(byId.code);
      case "fail":
        throw new Error("connection terminated");
    }
  });
  const client = {
    animals: { byId: animalsById },
    shelters: { byId: vi.fn(async () => makeDetailShelter()) },
    cities: { list: vi.fn(async () => [CITY]) },
  };
  return { client: client as unknown as AnimalPageClient, animalsById };
}
