import type { PublicShelterView, SheltersByIdInputSchema } from "@opika/contracts";
import { shelterRepo } from "@opika/db/repos";
import { ORPCError } from "@orpc/server";
import type { z } from "zod";
import type { AppContext } from "../context.js";

type SheltersInput = z.infer<typeof SheltersByIdInputSchema>;

export async function sheltersById(
  input: SheltersInput,
  context: AppContext,
): Promise<PublicShelterView> {
  const shelters = shelterRepo(context.db);
  const shelter = await shelters.findById(input.shelterId);

  // A shelter that exists but is not verified answers NOT_FOUND, same as
  // one that does not exist. Distinguishing would leak moderation state.
  if (shelter?.verification.status !== "verified") {
    throw new ORPCError("NOT_FOUND");
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
