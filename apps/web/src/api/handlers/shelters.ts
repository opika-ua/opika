import type { apiErrors, PublicShelterView, SheltersByIdInputSchema } from "@opika/contracts";
import { shelterRepo } from "@opika/db/repos";
import {
  earlyListingOf,
  publicDonationOf,
  publicListingBasisOf,
  shelterAvailabilityOf,
} from "@opika/domain";
import type { ORPCErrorConstructorMap } from "@orpc/server";
import type { z } from "zod";
import type { AppContext } from "../context";
import { cityOnlyLocationOf } from "./public-location";

type SheltersInput = z.infer<typeof SheltersByIdInputSchema>;

/** The exact subset `sheltersByIdContract` declares - see animals.ts's own comment (O-20). */
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

  // Only verified and paused shelters are reachable. Every other state answers NOT_FOUND, same as
  // an id that does not exist, so moderation state (a suspension, even one made mid-pause) is not
  // told apart from absence.
  // An early listing still running makes the page reachable, labelled; a lapsed one is as hidden
  // as no permission (read-time rule, `publicListingBasisOf`).
  const listedEarly =
    shelter !== null &&
    publicListingBasisOf(
      shelter.verification,
      earlyListingOf(shelter.earlyListingSince),
      context.now,
    ).kind === "listed_before_verification";
  const availability = listedEarly
    ? ({ kind: "open" } as const)
    : shelter
      ? shelterAvailabilityOf(shelter.verification)
      : null;
  if (!shelter || availability === null) {
    throw errors.NOT_FOUND();
  }

  return {
    id: shelter.id,
    displayName: shelter.displayName,
    description: shelter.description,
    publicLocation: cityOnlyLocationOf(shelter.publicLocation),
    // Only a verified (or paused) shelter shows its link; an early listing, a review or a suspension shows none.
    donation: publicDonationOf(shelter),
    logo: shelter.logo,
    createdAt: shelter.createdAt,
    freshnessSentence: shelter.freshnessSentence,
    verification: listedEarly ? "listed_before_verification" : "verified",
    availability,
  };
}
