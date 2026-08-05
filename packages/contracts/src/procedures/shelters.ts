import { ShelterIdSchema } from "@opika/domain";
import { oc } from "@orpc/contract";
import { z } from "zod";
import { apiErrors } from "../errors.js";
import { PublicShelterViewSchema } from "../views/shelter.js";

export const SheltersByIdInputSchema = z.object({
  shelterId: ShelterIdSchema,
});

/**
 * Returns the public projection, which carries an approximate location and no
 * contact details. An adopter reaches the real address through a reveal.
 */
export const sheltersByIdContract = oc
  .input(SheltersByIdInputSchema)
  .output(PublicShelterViewSchema)
  .errors({
    NOT_FOUND: apiErrors.NOT_FOUND,
    SHELTER_NOT_VISIBLE: apiErrors.SHELTER_NOT_VISIBLE,
    RATE_LIMITED: apiErrors.RATE_LIMITED,
  });
