import type { apiErrors, PublicShelterView, SheltersByIdInputSchema } from "@opika/contracts";
import { shelterRepo } from "@opika/db/repos";
import type { ORPCErrorConstructorMap } from "@orpc/server";
import type { z } from "zod";
import type { AppContext } from "../context";

type SheltersInput = z.infer<typeof SheltersByIdInputSchema>;

/** The exact subset `sheltersByIdContract` declares — see animals.ts's own comment (O-20). */
type SheltersByIdErrors = ORPCErrorConstructorMap<{
  NOT_FOUND: typeof apiErrors.NOT_FOUND;
  RATE_LIMITED: typeof apiErrors.RATE_LIMITED;
}>;

export async function sheltersById(
  input: SheltersInput,
  context: AppContext,
  errors: SheltersByIdErrors,
): Promise<PublicShelterView> {
  const shelters = shelterRepo(context.db);
  const shelter = await shelters.findById(input.shelterId);

  // A shelter that exists but is not verified answers NOT_FOUND, same as
  // one that does not exist. Distinguishing would leak moderation state.
  if (shelter?.verification.status !== "verified") {
    throw errors.NOT_FOUND();
  }

  return {
    id: shelter.id,
    displayName: shelter.displayName,
    description: shelter.description,
    publicLocation: shelter.publicLocation,
    donation: shelter.donation,
    createdAt: shelter.createdAt,
    verification: "verified",
  };
}
