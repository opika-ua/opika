import type { AnimalsRevealInputSchema, apiErrors, ContactRevealView } from "@opika/contracts";
import { animalRepo, revealRepo, shelterRepo } from "@opika/db/repos";
import {
  type ContactReveal,
  isDiscoverable,
  primaryPhoto,
  type RevealId,
  RevealIdSchema,
} from "@opika/domain";
import type { ORPCErrorConstructorMap } from "@orpc/server";
import type { z } from "zod";
import type { AppContext } from "../context";
import { checkRevealRateLimit } from "../reveal-rate-limit";
import { cityOnlyLocationOf } from "./public-location";

type RevealInput = z.infer<typeof AnimalsRevealInputSchema>;

/** The exact subset `animalsRevealContract` declares — see animals.ts's own comment (O-20). */
export type AnimalsRevealErrors = ORPCErrorConstructorMap<{
  NOT_FOUND: typeof apiErrors.NOT_FOUND;
  ANIMAL_NOT_AVAILABLE: typeof apiErrors.ANIMAL_NOT_AVAILABLE;
  SHELTER_NOT_VISIBLE: typeof apiErrors.SHELTER_NOT_VISIBLE;
  UNAUTHENTICATED: typeof apiErrors.UNAUTHENTICATED;
  RATE_LIMITED: typeof apiErrors.RATE_LIMITED;
}>;

/**
 * Reveal an animal's shelter contact details.
 *
 * This is the only endpoint that discloses contact details. It never
 * discloses the exact address (EM-D1): that stays in the stored snapshot. It:
 * - Requires an authenticated session
 * - Checks the animal is discoverable and its shelter is verified
 * - Is idempotent: a second reveal for the same animal returns the existing one
 * - Writes an immutable audit record with a denormalised shelter snapshot
 *   (exact address included, for the operator; `toView` leaves it out)
 * - Rate-limits per adopter via a Postgres counter (survives across instances)
 */
export async function animalsReveal(
  input: RevealInput,
  context: AppContext,
  errors: AnimalsRevealErrors,
): Promise<ContactRevealView> {
  if (!context.adopterId) {
    throw errors.UNAUTHENTICATED();
  }

  const animals = animalRepo(context.db);
  const animal = await animals.findById(input.animalId);

  if (!animal) {
    throw errors.NOT_FOUND();
  }

  if (!isDiscoverable(animal.listing)) {
    throw errors.ANIMAL_NOT_AVAILABLE();
  }

  const shelters = shelterRepo(context.db);
  const shelter = await shelters.findById(animal.shelterId);

  if (shelter?.verification.status !== "verified") {
    throw errors.SHELTER_NOT_VISIBLE();
  }

  // Idempotent: return existing reveal if one exists
  const reveals = revealRepo(context.db);
  const existing = await reveals.findByAdopterAndAnimal(context.adopterId, animal.id);
  if (existing) {
    return toView(existing);
  }

  // Rate limit check — persisted in Postgres, survives across instances.
  // Distinct-shelter budget: free if this shelter is already revealed
  // within the window (see checkRevealRateLimit's own doc comment).
  await checkRevealRateLimit(context.db, context.adopterId, shelter.id, context.now, errors);

  const reveal: ContactReveal = {
    id: RevealIdSchema.parse(crypto.randomUUID()) as RevealId,
    adopterId: context.adopterId,
    animalId: animal.id,
    shelterId: shelter.id,
    revealedAt: context.now,
    shelterSnapshot: {
      shelterId: shelter.id,
      displayName: shelter.displayName,
      contact: shelter.contact,
      exactAddress: shelter.exactAddress,
      publicLocation: shelter.publicLocation,
      verificationStatusAtReveal: shelter.verification.status,
      donation: shelter.donation,
    },
    animalSnapshot: {
      name: animal.name,
      primaryPhoto: primaryPhoto(animal),
    },
  };

  await reveals.insert(reveal);

  return toView(reveal);
}

/**
 * The stored reveal, cut down to what the adopter receives (EM-D1, Oleksii,
 * 2026-10-15: "the exact address never leaves the server for adopters"): the
 * snapshot's name, contact channels, donation link and status, and its city.
 * The exact address, district and point stay in the stored snapshot, the
 * operator's record. Shared by `animals.reveal` and `reveals.listMine`.
 *
 * Projected field by field here, not left to oRPC's output stripping alone:
 * handing the whole snapshot to the narrower view typechecks either way, so
 * this is what says, at the call site, that the address stays behind.
 */
export function toView(reveal: ContactReveal): ContactRevealView {
  const snapshot = reveal.shelterSnapshot;
  return {
    id: reveal.id,
    animalId: reveal.animalId,
    revealedAt: reveal.revealedAt,
    shelterSnapshot: {
      shelterId: snapshot.shelterId,
      displayName: snapshot.displayName,
      contact: snapshot.contact,
      verificationStatusAtReveal: snapshot.verificationStatusAtReveal,
      donation: snapshot.donation,
      publicLocation: cityOnlyLocationOf(snapshot.publicLocation),
    },
    animalSnapshot: reveal.animalSnapshot,
  };
}
