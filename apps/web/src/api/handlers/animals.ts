import type { AnimalDetailView, AnimalsByIdInputSchema, apiErrors } from "@opika/contracts";
import { animalRepo, shelterRepo } from "@opika/db/repos";
import { ageBucketOf, DEFAULT_FRESHNESS_POLICY, freshnessOf, isDiscoverable } from "@opika/domain";
import type { ORPCErrorConstructorMap } from "@orpc/server";
import type { z } from "zod";
import type { AppContext } from "../context";

type AnimalsInput = z.infer<typeof AnimalsByIdInputSchema>;

/**
 * The exact subset `animalsByIdContract` declares (`packages/contracts/src/
 * procedures/animals.ts`) — oRPC injects a constructor per declared code,
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

  if (!animal || !isDiscoverable(animal.listing)) {
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
    publicLocation: animal.publicLocation,
    description: animal.description,
    photos: animal.photos,
    vaccination: animal.vaccination,
    spayNeuter: animal.spayNeuter,
    documentReadiness: animal.documentReadiness,
    ageBucket: ageBucketOf(animal.age, context.now),
    freshness: freshnessOf(animal.lastUpdatedAt, context.now, DEFAULT_FRESHNESS_POLICY),
    shelter: {
      id: shelter.id,
      displayName: shelter.displayName,
      publicLocation: shelter.publicLocation,
      freshnessSentence: shelter.freshnessSentence,
      verification: "verified",
    },
  };
}
