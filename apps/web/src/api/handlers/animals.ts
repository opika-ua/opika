import type {
  AnimalDetailView,
  AnimalsByIdInputSchema,
  AnimalsCardsByIdsInputSchema,
  AnimalsCardsByIdsOutputSchema,
  apiErrors,
} from "@opika/contracts";
import { animalRepo, shelterRepo } from "@opika/db/repos";
import {
  ageBucketOf,
  isDiscoverableAnimal,
  isListedAnimal,
  isPubliclyVerified,
  primaryPhoto,
} from "@opika/domain";
import type { ORPCErrorConstructorMap } from "@orpc/server";
import type { z } from "zod";
import type { AppContext } from "../context";
import { discoverableListingKind } from "./discoverable-listing-kind";
import { listingFreshness } from "./listing-freshness";
import { cityOnlyLocationOf } from "./public-location";

type AnimalsInput = z.infer<typeof AnimalsByIdInputSchema>;

/**
 * The exact subset `animalsByIdContract` declares (`packages/contracts/src/
 * procedures/animals.ts`) - oRPC injects a constructor per declared code,
 * pre-carrying that code's `status`/`message` from `apiErrors` (O-20,
 * 2026-09-10), so a raw `new ORPCError(code)` here can no longer silently
 * answer 500 for a code that has a real status declared for it.
 */
type AnimalsByIdErrors = ORPCErrorConstructorMap<{
  NOT_FOUND: typeof apiErrors.NOT_FOUND;
  RATE_LIMITED: typeof apiErrors.RATE_LIMITED;
}>;

export async function animalsById(
  input: AnimalsInput,
  context: AppContext,
  errors: AnimalsByIdErrors,
): Promise<AnimalDetailView> {
  const animals = animalRepo(context.db);
  const animal = await animals.findById(input.animalId);

  // The guard narrows to a `DiscoverableAnimal` (F-B1): listed, so every
  // listing fact below is non-null by type, and a draft is NOT_FOUND here
  // before any of it is read.
  if (!animal || !isDiscoverableAnimal(animal)) {
    throw errors.NOT_FOUND();
  }

  const shelters = shelterRepo(context.db);
  const shelter = await shelters.findById(animal.shelterId);

  if (shelter?.verification.status !== "verified") {
    throw errors.NOT_FOUND();
  }

  return {
    id: animal.id,
    name: animal.name,
    species: animal.species,
    sex: animal.sex,
    size: animal.size,
    coatLength: animal.coatLength,
    publicLocation: animal.publicLocation && cityOnlyLocationOf(animal.publicLocation),
    description: animal.description,
    photos: animal.photos,
    vaccination: animal.vaccination,
    spayNeuter: animal.spayNeuter,
    documentReadiness: animal.documentReadiness,
    ageBucket: ageBucketOf(animal.age, context.now),
    freshness: listingFreshness(animal.listing, context.now),
    shelter: {
      id: shelter.id,
      displayName: shelter.displayName,
      publicLocation: cityOnlyLocationOf(shelter.publicLocation),
      verification: "verified",
    },
  };
}

type CardsByIdsInput = z.infer<typeof AnimalsCardsByIdsInputSchema>;
type CardsByIdsOutput = z.infer<typeof AnimalsCardsByIdsOutputSchema>;

/**
 * S8, the saved page: DR1-Q2 option (A), his spec. Never reads
 * `context.adopterId` (the caller omits the cookie client-side, so there is
 * usually none to read anyway) - the saved list is never tied to a session,
 * on-device only, the same as a reveal's own "Опіка never tells a shelter"
 * commitment is about what the *server* keeps, not what the caller sends.
 *
 * One batch query each for the animals and their shelters (the gallery
 * handler's own pattern), not one round trip per id. Nothing here logs
 * `input.animalIds` - the one requirement his spec states explicitly
 * ("nothing stored or logged about which ids were asked for") is upheld by
 * omission: there is no `console.log`/`console.error` anywhere in this
 * function at all, pinned by a test that spies on both.
 */
export async function animalsCardsByIds(
  input: CardsByIdsInput,
  context: AppContext,
): Promise<CardsByIdsOutput> {
  if (input.animalIds.length === 0) return { items: [] };

  const animalRows = await animalRepo(context.db).findByIds(input.animalIds);
  const animalById = new Map(animalRows.map((animal) => [animal.id, animal]));

  // Shelters for every *listed* animal (anything past `draft`), not only the
  // currently discoverable ones: a listed-but-withdrawn/adopted animal's
  // shelter is still needed below to tell it apart from a draft that was
  // never public at all (review of 529a6cc, finding 4).
  const listed = animalRows.filter(isListedAnimal);
  const shelterIds = [...new Set(listed.map((animal) => animal.shelterId))];
  const shelterRows = await shelterRepo(context.db).findByIds(shelterIds);
  const shelterById = new Map(shelterRows.map((shelter) => [shelter.id, shelter]));

  const items = input.animalIds.map((animalId) => {
    const animal = animalById.get(animalId);
    const shelter = animal && shelterById.get(animal.shelterId);
    // S8-F5: the precise fact, not an approximation - `everServedAt` is set
    // only the instant this exact listing was simultaneously discoverable
    // and its shelter publicly verified (`everServedAtAfter`), so a card
    // that was only ever published while pending, paused or suspended reads
    // `null` here regardless of what the shelter's own history later holds.
    const everServedAt = animal?.everServedAt ?? null;

    if (
      !animal ||
      !isDiscoverableAnimal(animal) ||
      !shelter ||
      !isPubliclyVerified(shelter.verification)
    ) {
      // The row exists and was once shown but isn't any more (adopted,
      // withdrawn, a paused or no-longer-verified shelter) - its name is
      // still honest to show. `null` for an id with no row behind it, or a
      // listing that was never actually served.
      //
      // A *current* draft is excluded even when `everServedAt` is set
      // (Tier 1 review finding 2, PR #196): `everServedAt` is monotonic and
      // never cleared, so a card restored to draft via «Скасувати
      // публікацію» keeps the fact that it was shown once - but its name on
      // the draft screen can be edited freely before ever being republished,
      // and this handler must never leak that unreviewed edit under cover of
      // "it was shown before" (the rule the 529a6cc review already settled:
      // a draft never returns a name).
      const isCurrentDraft = animal !== undefined && !isListedAnimal(animal);
      return {
        kind: "unavailable" as const,
        animalId,
        name: !isCurrentDraft && everServedAt !== null ? (animal?.name ?? null) : null,
      };
    }

    return {
      kind: "available" as const,
      animalId,
      card: {
        id: animal.id,
        name: animal.name,
        species: animal.species,
        sex: animal.sex,
        size: animal.size,
        coatLength: animal.coatLength,
        publicLocation: animal.publicLocation && cityOnlyLocationOf(animal.publicLocation),
        ageBucket: ageBucketOf(animal.age, context.now),
        freshness: listingFreshness(animal.listing, context.now),
        primaryPhoto: primaryPhoto(animal),
        listingKind: discoverableListingKind(animal.listing),
        shelter: {
          id: shelter.id,
          displayName: shelter.displayName,
          publicLocation: cityOnlyLocationOf(shelter.publicLocation),
          verification: "verified" as const,
        },
      },
    };
  });

  return { items };
}
