import { AnimalIdSchema } from "@opika/domain";
import { oc } from "@orpc/contract";
import { z } from "zod";
import { apiErrors } from "../errors.js";
import { AnimalDetailViewSchema } from "../views/animal.js";
import { ContactRevealViewSchema } from "../views/reveal.js";

export const AnimalsByIdInputSchema = z.object({
  animalId: AnimalIdSchema,
});

export const animalsByIdContract = oc
  .input(AnimalsByIdInputSchema)
  .output(AnimalDetailViewSchema)
  .errors({
    NOT_FOUND: apiErrors.NOT_FOUND,
    RATE_LIMITED: apiErrors.RATE_LIMITED,
  });

export const AnimalsRevealInputSchema = z.object({
  animalId: AnimalIdSchema,
});

/**
 * Deliberately separate from `swipes.record`.
 *
 * A reveal is a transactional, idempotent, append-only event: it writes the
 * shelter snapshot the adopter's history depends on, and later it is the entry
 * a reward ledger reads. Recording a swipe is best-effort and batchable. Fusing
 * them would give the cheap call the reliability requirements of the expensive
 * one and the expensive call the guarantees of the cheap one.
 *
 * Calling it twice for the same animal must return the existing reveal rather
 * than creating a second, so a double tap on a card cannot duplicate history.
 */
export const animalsRevealContract = oc
  .input(AnimalsRevealInputSchema)
  .output(ContactRevealViewSchema)
  .errors({
    NOT_FOUND: apiErrors.NOT_FOUND,
    ANIMAL_NOT_AVAILABLE: apiErrors.ANIMAL_NOT_AVAILABLE,
    SHELTER_NOT_VISIBLE: apiErrors.SHELTER_NOT_VISIBLE,
    RATE_LIMITED: apiErrors.RATE_LIMITED,
  });
