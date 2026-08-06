import { ShelterIdSchema } from "@opika/domain";
import { oc } from "@orpc/contract";
import { z } from "zod";
import { apiErrors } from "../errors";
import { PublicShelterViewSchema } from "../views/shelter";

export const SheltersByIdInputSchema = z.object({
  shelterId: ShelterIdSchema,
});

/**
 * Returns the public projection, which carries an approximate location and no
 * contact details. An adopter reaches the real address through a reveal.
 *
 * A shelter that exists but is not verified answers NOT_FOUND, the same as one
 * that does not exist. Distinguishing them would leak moderation state: ids are
 * public on every feed card, so "not visible" on a known id identifies a
 * shelter a moderator suspended or rejected.
 */
export const sheltersByIdContract = oc
  .input(SheltersByIdInputSchema)
  .output(PublicShelterViewSchema)
  .errors({
    NOT_FOUND: apiErrors.NOT_FOUND,
    RATE_LIMITED: apiErrors.RATE_LIMITED,
  });
