import type { AnimalDetailView, AnimalsByIdInputSchema } from "@opika/contracts";
import { animalRepo, shelterRepo } from "@opika/db/repos";
import { ageBucketOf, DEFAULT_FRESHNESS_POLICY, freshnessOf, isDiscoverable } from "@opika/domain";
import { ORPCError } from "@orpc/server";
import type { z } from "zod";
import type { AppContext } from "../context.js";

type AnimalsInput = z.infer<typeof AnimalsByIdInputSchema>;

export async function animalsById(
  input: AnimalsInput,
  context: AppContext,
): Promise<AnimalDetailView> {
  const animals = animalRepo(context.db);
  const animal = await animals.findById(input.animalId);

  if (!animal || !isDiscoverable(animal.listing)) {
    throw new ORPCError("NOT_FOUND");
  }

  const shelters = shelterRepo(context.db);
  const shelter = await shelters.findById(animal.shelterId);

  if (shelter?.verification.status !== "verified") {
    throw new ORPCError("NOT_FOUND");
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
