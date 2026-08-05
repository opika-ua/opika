import type {
  AccountId,
  AdopterIdentity,
  AdopterProfile,
  Animal,
  City,
  CityId,
  ContactReveal,
  LocalizedText,
  Shelter,
  Swipe,
  TextProvenance,
} from "@opika/domain";
import { ageAnchorOf } from "@opika/domain";
import type { adopters } from "../schema/adopters";
import type { animals } from "../schema/animals";
import type { cities } from "../schema/cities";
import type { reveals } from "../schema/reveals";
import type { shelters } from "../schema/shelters";
import type { swipes } from "../schema/swipes";

type CityRow = typeof cities.$inferSelect;
type ShelterRow = typeof shelters.$inferSelect;
type AnimalRow = typeof animals.$inferSelect;
type AdopterRow = typeof adopters.$inferSelect;
type SwipeRow = typeof swipes.$inferSelect;
type RevealRow = typeof reveals.$inferSelect;

type CityInsert = typeof cities.$inferInsert;
type ShelterInsert = typeof shelters.$inferInsert;
type AnimalInsert = typeof animals.$inferInsert;
type AdopterInsert = typeof adopters.$inferInsert;
type SwipeInsert = typeof swipes.$inferInsert;
type RevealInsert = typeof reveals.$inferInsert;

// --- LocalizedText helpers ---

function localizedTextToColumns(lt: LocalizedText): {
  uk: string;
  enText: string | null;
  enProvenance: TextProvenance | null;
} {
  return {
    uk: lt.uk,
    enText: lt.en?.text ?? null,
    enProvenance: lt.en?.provenance ?? null,
  };
}

function columnsToLocalizedText(
  uk: string,
  enText: string | null | undefined,
  enProvenance: string | null | undefined,
): LocalizedText {
  return {
    uk,
    en:
      enText != null && enProvenance != null
        ? { text: enText, provenance: enProvenance as TextProvenance }
        : null,
  };
}

// --- City ---

export function cityToRow(city: City): CityInsert {
  const desc = localizedTextToColumns(city.name);
  return {
    id: city.id,
    nameUk: desc.uk,
    nameEnText: desc.enText,
    nameEnProvenance: desc.enProvenance,
    centroidLat: city.centroid.lat,
    centroidLng: city.centroid.lng,
  };
}

export function rowToCity(row: CityRow): City {
  return {
    id: row.id,
    name: columnsToLocalizedText(row.nameUk, row.nameEnText, row.nameEnProvenance),
    centroid: { lat: row.centroidLat, lng: row.centroidLng },
  };
}

// --- Shelter ---

export function shelterToRow(shelter: Shelter): ShelterInsert {
  const desc = localizedTextToColumns(shelter.description);
  return {
    id: shelter.id,
    displayName: shelter.displayName,
    descriptionUk: desc.uk,
    descriptionEnText: desc.enText,
    descriptionEnProvenance: desc.enProvenance,
    legalEntity: shelter.legalEntity,
    publicLocation: shelter.publicLocation,
    exactAddress: shelter.exactAddress,
    contact: shelter.contact,
    donation: shelter.donation,
    freshnessSentenceUk: shelter.freshnessSentence?.uk ?? null,
    freshnessSentenceEn: shelter.freshnessSentence?.en?.text ?? null,
    verificationStatus: shelter.verification.status,
    verification: shelter.verification,
    cityId: shelter.publicLocation.cityId,
    exactLat: String(shelter.exactAddress.coordinates.lat),
    exactLng: String(shelter.exactAddress.coordinates.lng),
    createdAt: shelter.createdAt,
    lastUpdatedAt: shelter.lastUpdatedAt,
  };
}

export function rowToShelter(row: ShelterRow): Shelter {
  return {
    id: row.id,
    displayName: row.displayName,
    description: columnsToLocalizedText(
      row.descriptionUk,
      row.descriptionEnText,
      row.descriptionEnProvenance,
    ),
    legalEntity: row.legalEntity,
    publicLocation: row.publicLocation,
    exactAddress: row.exactAddress,
    contact: row.contact,
    donation: row.donation ?? null,
    freshnessSentence: row.freshnessSentenceUk
      ? columnsToLocalizedText(row.freshnessSentenceUk, row.freshnessSentenceEn ?? null, "human")
      : null,
    verification: row.verification,
    createdAt: row.createdAt,
    lastUpdatedAt: row.lastUpdatedAt,
  };
}

// --- Animal ---

export function animalToRowWithCity(animal: Animal, cityId: CityId): AnimalInsert {
  const desc = localizedTextToColumns(animal.description);
  return {
    id: animal.id,
    shelterId: animal.shelterId,
    name: animal.name,
    species: animal.species,
    sex: animal.sex,
    size: animal.size,
    age: animal.age,
    ageAnchorAt: ageAnchorOf(animal.age),
    descriptionUk: desc.uk,
    descriptionEnText: desc.enText,
    descriptionEnProvenance: desc.enProvenance,
    photos: animal.photos,
    vaccination: animal.vaccination,
    spayNeuter: animal.spayNeuter,
    documentReadiness: animal.documentReadiness,
    listing: animal.listing,
    listingKind: animal.listing.kind,
    publicLocation: animal.publicLocation,
    cityId,
    createdAt: animal.createdAt,
    lastUpdatedAt: animal.lastUpdatedAt,
  };
}

export function rowToAnimal(row: AnimalRow): Animal {
  return {
    id: row.id,
    shelterId: row.shelterId,
    name: row.name,
    species: row.species,
    sex: row.sex,
    size: row.size,
    age: row.age,
    description: columnsToLocalizedText(
      row.descriptionUk,
      row.descriptionEnText,
      row.descriptionEnProvenance,
    ),
    photos: row.photos,
    vaccination: row.vaccination,
    spayNeuter: row.spayNeuter,
    documentReadiness: row.documentReadiness,
    listing: row.listing,
    publicLocation: row.publicLocation ?? null,
    createdAt: row.createdAt,
    lastUpdatedAt: row.lastUpdatedAt,
  };
}

// --- Adopter ---

export function adopterToRow(profile: AdopterProfile): AdopterInsert {
  const identity = profile.identity;
  return {
    id: profile.id,
    identityKind: identity.kind,
    deviceSessionId: identity.kind === "anonymous" ? identity.deviceSessionId : null,
    accountId: identity.kind === "account" ? identity.accountId : null,
    email: identity.kind === "account" ? identity.email : null,
    country: profile.country,
    preferredLocale: profile.preferredLocale,
    savedFilters: profile.savedFilters,
    createdAt: profile.createdAt,
  };
}

export function rowToAdopter(row: AdopterRow): AdopterProfile {
  let identity: AdopterIdentity;
  if (row.identityKind === "anonymous" && row.deviceSessionId) {
    identity = { kind: "anonymous", deviceSessionId: row.deviceSessionId };
  } else if (row.identityKind === "account" && row.accountId && row.email) {
    identity = {
      kind: "account",
      accountId: row.accountId as AccountId,
      email: row.email,
    };
  } else {
    throw new Error(`Inconsistent adopter identity row: kind=${row.identityKind}`);
  }
  return {
    id: row.id,
    identity,
    country: row.country,
    preferredLocale: row.preferredLocale,
    savedFilters: row.savedFilters ?? null,
    createdAt: row.createdAt,
  };
}

// --- Swipe ---

export function swipeToRow(swipe: Swipe): SwipeInsert {
  return {
    adopterId: swipe.adopterId,
    animalId: swipe.animalId,
    direction: swipe.direction,
    swipedAt: swipe.at,
  };
}

export function rowToSwipe(row: SwipeRow): Swipe {
  return {
    adopterId: row.adopterId,
    animalId: row.animalId,
    direction: row.direction,
    at: row.swipedAt,
  };
}

// --- Reveal ---

export function revealToRow(reveal: ContactReveal): RevealInsert {
  return {
    id: reveal.id,
    adopterId: reveal.adopterId,
    animalId: reveal.animalId,
    shelterId: reveal.shelterId,
    revealedAt: reveal.revealedAt,
    shelterSnapshot: reveal.shelterSnapshot,
    animalSnapshot: reveal.animalSnapshot,
  };
}

export function rowToReveal(row: RevealRow): ContactReveal {
  return {
    id: row.id,
    adopterId: row.adopterId,
    animalId: row.animalId,
    shelterId: row.shelterId,
    revealedAt: row.revealedAt,
    shelterSnapshot: row.shelterSnapshot,
    animalSnapshot: row.animalSnapshot,
  };
}
