import { randomUUID } from "node:crypto";
import {
  type AdopterProfile,
  type AgeEstimate,
  type Animal,
  type AnimalListingState,
  ageAnchorOf,
  type City,
  type ContactReveal,
  type CountryCode,
  type Edrpou,
  type ExactAddress,
  publicLocationOf,
  type Shelter,
  type ShelterContact,
  type ShelterVerification,
  type Swipe,
  testOnlyLocationPolicy,
  UNKNOWN_DOCUMENT_READINESS,
} from "@opika/domain";

const policy = testOnlyLocationPolicy();

function uuid<T extends string>(): T {
  return randomUUID() as T;
}

const now = new Date("2026-08-01T12:00:00Z");

const defaultContact: ShelterContact = {
  primary: { kind: "phone", e164: "+380501234567" },
  additional: [],
};

const defaultExactAddress: ExactAddress = {
  line1: "вул. Тестова 1",
  line2: null,
  postalCode: "01001",
  cityId: uuid(),
  district: null,
  coordinates: { lat: 50.45, lng: 30.52 },
};

const defaultVerification: ShelterVerification = {
  status: "verified",
  verifiedAt: now,
  verifiedBy: uuid(),
  evidence: { items: [], submittedAt: now },
};

export function makeCity(overrides: Partial<City> = {}): City {
  return {
    id: uuid(),
    name: { uk: "Тест", en: null },
    centroid: { lat: 50.45, lng: 30.52 },
    ...overrides,
  };
}

export function makeShelter(overrides: Partial<Shelter> = {}): Shelter {
  const id = overrides.id ?? uuid();
  const exactAddress = overrides.exactAddress ?? {
    ...defaultExactAddress,
    cityId: overrides.publicLocation?.cityId ?? defaultExactAddress.cityId,
  };

  return {
    id,
    displayName: "Тестовий притулок",
    description: { uk: "Опис притулку для тестів", en: null },
    legalEntity: {
      kind: "registered_ngo",
      legalName: "ТОВ Тест",
      edrpou: "12345678" as Edrpou,
      registeredAt: now,
    },
    publicLocation: overrides.publicLocation ?? publicLocationOf(id, exactAddress, policy),
    exactAddress,
    contact: defaultContact,
    donation: null,
    freshnessSentence: null,
    verification: defaultVerification,
    createdAt: now,
    lastUpdatedAt: now,
    ...overrides,
  };
}

const defaultAge: AgeEstimate = {
  kind: "birth_date",
  date: new Date("2024-01-15"),
  precision: "day",
};

const defaultListing: AnimalListingState = { kind: "published", publishedAt: now };

export function makeAnimal(overrides: Partial<Animal> = {}): Animal {
  return {
    id: uuid(),
    shelterId: uuid(),
    name: "Бровко",
    species: "dog",
    sex: "male",
    size: "medium",
    age: defaultAge,
    description: { uk: "Дуже гарний песик", en: null },
    photos: [],
    vaccination: { source: "shelter_declared", state: "unknown", declaredAt: now },
    spayNeuter: { source: "shelter_declared", state: "unknown", declaredAt: now },
    documentReadiness: UNKNOWN_DOCUMENT_READINESS,
    listing: defaultListing,
    publicLocation: null,
    createdAt: now,
    lastUpdatedAt: now,
    ...overrides,
  };
}

export function makeAdopter(overrides: Partial<AdopterProfile> = {}): AdopterProfile {
  return {
    id: uuid(),
    identity: { kind: "anonymous", deviceSessionId: randomUUID() + randomUUID() },
    country: "UA" as CountryCode,
    preferredLocale: "uk",
    savedFilters: null,
    createdAt: now,
    ...overrides,
  };
}

export function makeSwipe(overrides: Partial<Swipe> = {}): Swipe {
  return {
    adopterId: uuid(),
    animalId: uuid(),
    direction: "pass",
    at: now,
    ...overrides,
  };
}

export function makeReveal(overrides: Partial<ContactReveal> = {}): ContactReveal {
  const shelterId = overrides.shelterId ?? uuid();
  return {
    id: uuid(),
    adopterId: uuid(),
    animalId: uuid(),
    shelterId,
    revealedAt: now,
    shelterSnapshot: {
      shelterId,
      displayName: "Тестовий притулок",
      contact: defaultContact,
      exactAddress: defaultExactAddress,
      publicLocation: publicLocationOf(shelterId, defaultExactAddress, policy),
      verificationStatusAtReveal: "verified",
      donation: null,
    },
    animalSnapshot: { name: "Бровко", primaryPhoto: null },
    ...overrides,
  };
}

export { ageAnchorOf, now, policy, uuid };
