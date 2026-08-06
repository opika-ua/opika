import type { AnimalsRevealInputSchema, ContactRevealView } from "@opika/contracts";
import { animalRepo, revealRepo, shelterRepo } from "@opika/db/repos";
import {
  type ContactReveal,
  isDiscoverable,
  primaryPhoto,
  type RevealId,
  RevealIdSchema,
} from "@opika/domain";
import { ORPCError } from "@orpc/server";
import type { z } from "zod";
import type { AppContext } from "../context";
import { checkRevealRateLimit } from "../rate-limit";

type RevealInput = z.infer<typeof AnimalsRevealInputSchema>;

/**
 * Reveal an animal's shelter contact details.
 *
 * This is the only endpoint that discloses contact details and exact
 * addresses. It:
 * - Requires an authenticated session
 * - Checks the animal is discoverable and its shelter is verified
 * - Is idempotent: a second reveal for the same animal returns the existing one
 * - Writes an immutable audit record with a denormalised shelter snapshot
 * - Rate-limits per adopter via a Postgres counter (survives across instances)
 */
export async function animalsReveal(
  input: RevealInput,
  context: AppContext,
): Promise<ContactRevealView> {
  if (!context.adopterId) {
    throw new ORPCError("UNAUTHENTICATED");
  }

  const animals = animalRepo(context.db);
  const animal = await animals.findById(input.animalId);

  if (!animal) {
    throw new ORPCError("NOT_FOUND");
  }

  if (!isDiscoverable(animal.listing)) {
    throw new ORPCError("ANIMAL_NOT_AVAILABLE");
  }

  const shelters = shelterRepo(context.db);
  const shelter = await shelters.findById(animal.shelterId);

  if (shelter?.verification.status !== "verified") {
    throw new ORPCError("SHELTER_NOT_VISIBLE");
  }

  // Idempotent: return existing reveal if one exists
  const reveals = revealRepo(context.db);
  const existing = await reveals.findByAdopterAndAnimal(context.adopterId, animal.id);
  if (existing) {
    return toView(existing);
  }

  // Rate limit check — persisted in Postgres, survives across instances
  await checkRevealRateLimit(context.db, context.adopterId, context.now);

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

function toView(reveal: ContactReveal): ContactRevealView {
  return {
    id: reveal.id,
    animalId: reveal.animalId,
    revealedAt: reveal.revealedAt,
    shelterSnapshot: reveal.shelterSnapshot,
    animalSnapshot: reveal.animalSnapshot,
  };
}
