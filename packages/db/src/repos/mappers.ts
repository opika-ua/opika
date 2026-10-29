import type {
  AccountId,
  AdopterIdentity,
  AdopterProfile,
  Animal,
  AnimalColour,
  City,
  CityId,
  CoatColour,
  ContactReveal,
  LocalizedText,
  Shelter,
  Swipe,
  Temperament,
  TemperamentTrait,
  TextProvenance,
} from "@opika/domain";
import {
  type AnimalListingState,
  ageAnchorOf,
  CitySlugSchema,
  confirmationAnchorOf,
  type DiscoverableAnimal,
  isDiscoverableAnimal,
  searchLatinOf,
  searchNameOf,
  temperamentTraitsOf,
  waitAnchorOf,
} from "@opika/domain";
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

export function localizedTextToColumns(lt: LocalizedText): {
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

/** An optional `LocalizedText` as its three nullable columns: all null when there is none. */
function optionalTextToColumns(lt: LocalizedText | null): {
  uk: string | null;
  enText: string | null;
  enProvenance: TextProvenance | null;
} {
  return lt === null ? { uk: null, enText: null, enProvenance: null } : localizedTextToColumns(lt);
}

/** The reverse. No Ukrainian is no text: the `_en_check` CHECKs keep an English one from being stored alone. */
function columnsToOptionalText(
  uk: string | null,
  enText: string | null,
  enProvenance: string | null,
): LocalizedText | null {
  return uk === null ? null : columnsToLocalizedText(uk, enText, enProvenance);
}

// --- The pet card's temperament and colour ---
//
// `Temperament` is presets then at most one custom entry, last
// (`TemperamentSchema`), so it splits into the filterable array and one
// optional text, and joins back in exactly the order it was stored.

const customTemperamentOf = (temperament: Temperament): LocalizedText | null => {
  const last = temperament.at(-1);
  return last?.kind === "custom" ? last.text : null;
};

function columnsToTemperament(
  traits: readonly TemperamentTrait[],
  custom: LocalizedText | null,
): Temperament {
  return [
    ...traits.map((trait) => ({ kind: "preset" as const, trait })),
    ...(custom === null ? [] : [{ kind: "custom" as const, text: custom }]),
  ];
}

function columnsToColour(
  preset: CoatColour | null,
  custom: LocalizedText | null,
): AnimalColour | null {
  if (preset !== null) return { kind: "preset", colour: preset };
  return custom === null ? null : { kind: "custom", text: custom };
}

// --- City ---
//
// Not `localizedTextToColumns`/`columnsToLocalizedText` - those two exist
// for `LocalizedText`, whose `en` is genuinely nullable (a shelter or
// animal description can be Ukrainian-only). `City.name` is the stricter
// `CityName` (`packages/domain`, tightened 2026-09-12 alongside this
// table's own `name_en_text`/`name_en_provenance` `NOT NULL` columns): `en`
// is required, so there is no nullable case for a City-specific mapper to
// handle, and reusing the general helpers here would silently widen back to
// accepting a null `en` the type no longer permits.

export function cityToRow(city: City): CityInsert {
  const centroid = city.centroid;
  return {
    id: city.id,
    slug: city.slug,
    nameUk: city.name.uk,
    nameEnText: city.name.en.text,
    nameEnProvenance: city.name.en.provenance,
    regionId: city.regionId,
    kind: city.kind,
    districtNameUk: city.district?.uk ?? null,
    hromadaNameUk: city.hromada?.uk ?? null,
    nameScope: city.nameScope,
    // Derived here so no writer can store a key that disagrees with the name.
    searchName: searchNameOf(city.name.uk),
    searchLatin: searchLatinOf(city.name.uk),
    centroidLat: centroid.kind === "recorded" ? centroid.coordinates.lat : null,
    centroidLng: centroid.kind === "recorded" ? centroid.coordinates.lng : null,
    centroidSource: centroid.kind === "recorded" ? centroid.source : null,
  };
}

export function rowToCity(row: CityRow): City {
  return {
    id: row.id,
    slug: CitySlugSchema.parse(row.slug),
    regionId: row.regionId,
    kind: row.kind,
    name: {
      uk: row.nameUk,
      en: { text: row.nameEnText, provenance: row.nameEnProvenance },
    },
    district: row.districtNameUk === null ? null : { uk: row.districtNameUk },
    hromada: row.hromadaNameUk === null ? null : { uk: row.hromadaNameUk },
    nameScope: row.nameScope,
    centroid:
      row.centroidLat !== null && row.centroidLng !== null && row.centroidSource !== null
        ? {
            kind: "recorded",
            coordinates: { lat: row.centroidLat, lng: row.centroidLng },
            source: row.centroidSource,
          }
        : { kind: "not_recorded" },
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
    logo: shelter.logo,
    pendingDonation: shelter.pendingDonation,
    version: shelter.version,
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
    logo: row.logo ?? null,
    pendingDonation: row.pendingDonation ?? null,
    version: row.version,
    freshnessSentence: row.freshnessSentenceUk
      ? columnsToLocalizedText(row.freshnessSentenceUk, row.freshnessSentenceEn ?? null, "human")
      : null,
    verification: row.verification,
    createdAt: row.createdAt,
    lastUpdatedAt: row.lastUpdatedAt,
  };
}

// --- Animal ---

/**
 * A draft's missing facts become NULL columns (F-B1): a null age gives a null
 * `age_anchor_at` too, and a null description nulls all three description
 * columns. The CHECKs in `schema/animals.ts` keep both pairings, and refuse
 * the nulls on any listing kind but a draft.
 */
export function animalToRowWithCity(animal: Animal, cityId: CityId): AnimalInsert {
  const desc = animal.description === null ? null : localizedTextToColumns(animal.description);
  const temperamentCustom = optionalTextToColumns(customTemperamentOf(animal.temperament));
  const colourCustom = optionalTextToColumns(
    animal.colour?.kind === "custom" ? animal.colour.text : null,
  );
  const medicalNotes = optionalTextToColumns(animal.medicalNotes);
  return {
    id: animal.id,
    shelterId: animal.shelterId,
    name: animal.name,
    species: animal.species,
    sex: animal.sex,
    coatLength: animal.coatLength,
    size: animal.size,
    age: animal.age,
    ageAnchorAt: animal.age === null ? null : ageAnchorOf(animal.age),
    descriptionUk: desc?.uk ?? null,
    descriptionEnText: desc?.enText ?? null,
    descriptionEnProvenance: desc?.enProvenance ?? null,
    photos: animal.photos,
    vaccination: animal.vaccination,
    spayNeuter: animal.spayNeuter,
    documentReadiness: animal.documentReadiness,
    temperamentTraits: temperamentTraitsOf(animal.temperament),
    temperamentCustomUk: temperamentCustom.uk,
    temperamentCustomEnText: temperamentCustom.enText,
    temperamentCustomEnProvenance: temperamentCustom.enProvenance,
    coatColour: animal.colour?.kind === "preset" ? animal.colour.colour : null,
    coatColourCustomUk: colourCustom.uk,
    coatColourCustomEnText: colourCustom.enText,
    coatColourCustomEnProvenance: colourCustom.enProvenance,
    medicalNotesUk: medicalNotes.uk,
    medicalNotesEnText: medicalNotes.enText,
    medicalNotesEnProvenance: medicalNotes.enProvenance,
    listing: animal.listing,
    listingKind: animal.listing.kind,
    waitAnchorAt: waitAnchorOf(animal.listing),
    lastConfirmedAt: confirmationAnchorOf(animal.listing),
    firstPublishedAt: firstPublishedAnchorOf(animal.listing),
    everServedAt: animal.everServedAt,
    publicLocation: animal.publicLocation,
    cityId,
    createdAt: animal.createdAt,
    lastUpdatedAt: animal.lastUpdatedAt,
    version: animal.version,
  };
}

/**
 * The row as the animal union (F-B1). A draft keeps its nulls; any other
 * listing must carry every listing fact, and a row that doesn't throws rather
 * than reaching a view typed as complete. `animals_listing_facts_check` makes
 * that row impossible to write, so the throw is the second line, not the
 * first.
 */
export function rowToAnimal(row: AnimalRow): Animal {
  const core = {
    id: row.id,
    shelterId: row.shelterId,
    name: row.name,
    species: row.species,
    sex: row.sex,
    coatLength: row.coatLength ?? null,
    photos: row.photos,
    vaccination: row.vaccination,
    spayNeuter: row.spayNeuter,
    documentReadiness: row.documentReadiness,
    temperament: columnsToTemperament(
      row.temperamentTraits,
      columnsToOptionalText(
        row.temperamentCustomUk,
        row.temperamentCustomEnText,
        row.temperamentCustomEnProvenance,
      ),
    ),
    colour: columnsToColour(
      row.coatColour ?? null,
      columnsToOptionalText(
        row.coatColourCustomUk,
        row.coatColourCustomEnText,
        row.coatColourCustomEnProvenance,
      ),
    ),
    medicalNotes: columnsToOptionalText(
      row.medicalNotesUk,
      row.medicalNotesEnText,
      row.medicalNotesEnProvenance,
    ),
    publicLocation: row.publicLocation ?? null,
    everServedAt: row.everServedAt ?? null,
    createdAt: row.createdAt,
    lastUpdatedAt: row.lastUpdatedAt,
    version: row.version,
  };
  const size = row.size ?? null;
  const age = row.age ?? null;
  const description =
    row.descriptionUk === null
      ? null
      : columnsToLocalizedText(
          row.descriptionUk,
          row.descriptionEnText,
          row.descriptionEnProvenance,
        );
  const { listing } = row;
  if (listing.kind === "draft") return { ...core, size, age, description, listing };
  if (size === null || age === null || description === null) {
    throw new Error(
      `Animal ${row.id} is ${listing.kind} but lacks a listing fact; only a draft may (F-B1)`,
    );
  }
  return { ...core, size, age, description, listing };
}

/**
 * The public surfaces' mapper: the feed and the gallery select only
 * discoverable rows (`buildDiscoverabilityPredicate`), and this says so in the
 * type, throwing if the predicate ever handed it anything else. A draft can't
 * reach a public view through these repositories even by a query mistake.
 */
export function rowToDiscoverableAnimal(row: AnimalRow): DiscoverableAnimal {
  const animal = rowToAnimal(row);
  if (!isDiscoverableAnimal(animal)) {
    throw new Error(
      `Animal ${row.id} is ${animal.listing.kind}; a public query returned a non-discoverable row`,
    );
  }
  return animal;
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

/**
 * The first-published marker an animal gets when it is *inserted* in a given
 * state, matching migration 0010's backfill: a published or reserved listing
 * carries its `publishedAt`; an adopted or withdrawn one can only have got
 * there by being public, but no longer carries when, so its own instant
 * stands in as "public no later than", not the real first publication
 * (HS-Q11, Oleksii: A). A delete guard only, never shown. A draft has never
 * been public. Writes after insert never clear it: `animalRepo.update`
 * coalesces, and listing moves only ever fill it in.
 */
export function firstPublishedAnchorOf(listing: AnimalListingState): Date | null {
  switch (listing.kind) {
    case "draft":
      return null;
    case "published":
    case "reserved":
      return listing.publishedAt;
    case "adopted":
      return listing.adoptedAt;
    case "withdrawn":
      return listing.withdrawnAt;
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled variant; unreachable at runtime */
    default: {
      const unreachable: never = listing;
      return unreachable;
    }
  }
}
