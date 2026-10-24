import { z } from "zod";
import { AnimalIdSchema, ShelterIdSchema } from "../primitives/ids";
import { LocalizedTextSchema } from "../primitives/localized-text";
import { PublicLocationSchema } from "../shelters/location";
import { isPubliclyVerified, type ShelterVerification } from "../shelters/verification";
import { AgeEstimateSchema } from "./age";
import { SpayNeuterStatusSchema, VaccinationStatusSchema } from "./attestation";
import { CoatLengthSchema } from "./coat";
import { DocumentReadinessSchema } from "./document-readiness";
import {
  type AnimalListingState,
  type DiscoverableListing,
  DraftListingSchema,
  isDiscoverable,
  NonDraftListingSchema,
} from "./listing";
import { type AnimalPhoto, AnimalPhotoSchema, MAX_ANIMAL_PHOTOS } from "./photo";
import { SizeBucketSchema } from "./size";

/**
 * Closed at dog and cat. Adding a species later is an additive change the
 * exhaustiveness checks turn into a guided edit, whereas an open "other"
 * variant would make the filter permanently unenumerable and would immediately
 * break the weight hints attached to SizeBucket, which describe dogs and cats.
 */
export const AnimalSpeciesSchema = z.enum(["dog", "cat"]);
export type AnimalSpecies = z.infer<typeof AnimalSpeciesSchema>;

export const ANIMAL_SPECIES = ["dog", "cat"] as const satisfies readonly AnimalSpecies[];

export const AnimalSexSchema = z.enum(["male", "female", "unknown"]);
export type AnimalSex = z.infer<typeof AnimalSexSchema>;

/**
 * What every animal has from the moment it exists (K-Q5, Oleksii: "name +
 * species to create; everything else and ≥1 photo to publish").
 *
 * `sex` is never missing: a new animal starts at "unknown" («Не записано»),
 * the way its medical facts start unknown (D2, Oleksii: "sex defaults to
 * "unknown" («Не записано»). Sex stays NOT NULL and is not a publish gap.").
 *
 * `lastUpdatedAt` is edit time: when anything on the record last changed. It
 * is not what freshness measures — that is `listing.confirmedAt` (H2-3), when
 * the shelter last said the animal is still looking, which a form edit never
 * moves. Kept required because the kabinet shows it ("Чернетку збережено …").
 */
const animalCoreShape = {
  id: AnimalIdSchema,
  shelterId: ShelterIdSchema,
  name: z.string().min(1),
  species: AnimalSpeciesSchema,
  sex: AnimalSexSchema,
  /**
   * Null is «Не записано» on drafts and listed animals alike (DR1-D10): fur is
   * not a `ListingFacts` requirement, so no published animal needs it to stay
   * editable, and no backfill invents it for one.
   */
  coatLength: CoatLengthSchema.nullable(),
  photos: z.array(AnimalPhotoSchema).max(MAX_ANIMAL_PHOTOS).readonly(),
  vaccination: VaccinationStatusSchema,
  spayNeuter: SpayNeuterStatusSchema,
  documentReadiness: DocumentReadinessSchema,
  /**
   * When an animal is fostered away from its shelter, it has its own public
   * location at `city` precision (city + district, no coordinates). When
   * null, the animal is at the shelter and inherits the shelter's
   * `fuzzed_address`-precision public location.
   *
   * No exact foster address is ever stored — a foster home is a private
   * residence. The city centroid is `City.centroid`, honestly labelled as
   * such, rather than posing as the animal's position (not served to
   * adopters since 2026-10-14: EM-Q10 sends the city only). Built via
   * `animalPublicLocationOf(cityId, district)`.
   */
  publicLocation: PublicLocationSchema.nullable(),
  /**
   * The first instant this exact row was both discoverable and its shelter
   * publicly verified — the only precise answer to "was this card ever
   * actually rendered to an adopter" (S8-F5). Set once, never cleared: a
   * card withdrawn and restored to draft keeps the fact that it was shown
   * before, which is the whole point of "ever". Approximating this from
   * `hasBeenVerified(shelter.verification)` alone is what S8-F5 was —
   * "the shelter was verified at some point" isn't "this listing was live
   * while it was".
   */
  everServedAt: z.date().nullable(),
  createdAt: z.date(),
  lastUpdatedAt: z.date(),
  /**
   * Bumped by every edit (S3-T6, Oleksii: "integer version for animals too
   * (same as shelters)"). K3's form saves compare-and-set on it, so two
   * people editing one animal can't overwrite each other. Listing moves and
   * photo writes never bump it (RG-Q7, P-Q3): they compare on the listing or
   * the photo list itself, so an open edit form, a «Ще шукає» and a photo
   * change never conflict. An integer, not `lastUpdatedAt`: JS dates hold
   * milliseconds, Postgres timestamps microseconds.
   */
  version: z.int().nonnegative(),
};

/**
 * What a listing must carry before anyone can see it (K-Q5: "everything else
 * ... to publish"). The medical facts are not here: «Не записано» is a
 * complete answer (standing product rule), so the unknown a draft starts with
 * is publishable as it stands.
 */
export const ListingFactsSchema = z.object({
  size: SizeBucketSchema,
  age: AgeEstimateSchema,
  description: LocalizedTextSchema,
});
export type ListingFacts = z.infer<typeof ListingFactsSchema>;

/**
 * A draft may lack any listing fact (F-B1). Nullable, not optional, so the
 * absence survives a JSON round trip (`LocalizedText`'s own rule). A draft
 * restored from a withdrawn listing keeps every fact it had: a set value is a
 * valid value of a nullable field.
 */
export const DraftAnimalSchema = z.object({
  ...animalCoreShape,
  size: SizeBucketSchema.nullable(),
  age: AgeEstimateSchema.nullable(),
  description: LocalizedTextSchema.nullable(),
  listing: DraftListingSchema,
});
export type DraftAnimal = z.infer<typeof DraftAnimalSchema>;

/** Published, reserved, adopted or withdrawn: each was published once, so each is complete. */
export const ListedAnimalSchema = z.object({
  ...animalCoreShape,
  ...ListingFactsSchema.shape,
  listing: NonDraftListingSchema,
});
export type ListedAnimal = z.infer<typeof ListedAnimalSchema>;

/**
 * `z.union`, not `z.discriminatedUnion`: the discriminant is nested
 * (`listing.kind`), which Zod can't key a discriminated union on, and a
 * top-level duplicate of it would be a second stored fact that could disagree
 * with the first (shapes doc §1.2). Parsing tries the draft option first.
 */
export const AnimalSchema = z.union([DraftAnimalSchema, ListedAnimalSchema]);
export type Animal = DraftAnimal | ListedAnimal;

/** What an adopter can be shown: listed, and in a visible state. */
export type DiscoverableAnimal = ListedAnimal & { listing: DiscoverableListing };

/*
 * Guards rather than `switch (animal.listing.kind)`: TypeScript narrows a
 * union only by a discriminant on the object itself, so checking
 * `animal.listing.kind` narrows the listing and leaves `animal` a union
 * (microsoft/TypeScript#18758).
 */
export const isDraftAnimal = (animal: Animal): animal is DraftAnimal =>
  animal.listing.kind === "draft";

export const isListedAnimal = (animal: Animal): animal is ListedAnimal =>
  animal.listing.kind !== "draft";

export const isDiscoverableAnimal = (animal: Animal): animal is DiscoverableAnimal =>
  isDiscoverable(animal.listing);

export const primaryPhoto = (animal: Animal): AnimalPhoto | null => animal.photos[0] ?? null;

/**
 * The `everServedAt` an animal's own row should carry after a write that
 * could newly satisfy `buildDiscoverabilityPredicate` (`packages/db/src/
 * repos/feed-predicate.ts` — the actual query every adopter-facing surface
 * runs, which this mirrors exactly: `isDiscoverable(listing) &&
 * isPubliclyVerified(verification)`). Monotonic by construction: once set,
 * `current` always wins, so a later withdraw or suspension can't un-ring
 * this bell.
 */
export const everServedAtAfter = (
  current: Date | null,
  listing: AnimalListingState,
  verification: ShelterVerification,
  now: Date,
): Date | null =>
  current ?? (isDiscoverable(listing) && isPubliclyVerified(verification) ? now : null);
