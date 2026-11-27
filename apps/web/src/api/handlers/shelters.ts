import type {
  apiErrors,
  ListedShelterView,
  PublicShelterView,
  SheltersByIdInputSchema,
  SheltersListedOutputSchema,
} from "@opika/contracts";
import { galleryRepo, shelterRepo } from "@opika/db/repos";
import {
  earlyListingOf,
  organisationWordOf,
  publicDonationOf,
  publicListingBasisOf,
  type ShelterId,
  shelterAvailabilityOf,
} from "@opika/domain";
import type { ORPCErrorConstructorMap } from "@orpc/server";
import type { z } from "zod";
import type { AppContext } from "../context";
import { cityLabelsFor } from "./city-labels";
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
    verification: listedEarly ? "listed_before_verification" : "verified",
    availability,
    organisationWord: organisationWordOf(shelter.legalEntity?.kind ?? null),
  };
}

/**
 * The shelters list (`/prytulky`) from existing reads only: the sitemap's animal rows (verified-only
 * basis) name the shelters and give each one's count; one batch read of those shelters, projected
 * field by field (never the address or contact), and one of their cities' labels.
 */
export async function sheltersListed(
  context: AppContext,
): Promise<z.infer<typeof SheltersListedOutputSchema>> {
  const rows = await galleryRepo(context.db).sitemapRows({ now: context.now });
  const counts = listedCountsOf(rows);
  const found = await shelterRepo(context.db).findByIds([...counts.keys()]);
  const items = found.flatMap((shelter): ListedShelterView[] =>
    // Re-checked: a status can change between the two reads.
    shelter.verification.status === "verified"
      ? [
          {
            id: shelter.id,
            displayName: shelter.displayName,
            logo: shelter.logo,
            createdAt: shelter.createdAt,
            publicLocation: cityOnlyLocationOf(shelter.publicLocation),
            organisationWord: organisationWordOf(shelter.legalEntity?.kind ?? null),
            listedAnimalCount: counts.get(shelter.id) ?? 0,
          },
        ]
      : [],
  );
  const cityLabels = await cityLabelsFor(
    context.db,
    items.map((item) => item.publicLocation.cityId),
  );
  return { items, cityLabels };
}

/** Each shelter's listed animals: its rows among the sitemap's animal rows. */
export function listedCountsOf(
  rows: readonly { readonly shelterId: ShelterId }[],
): ReadonlyMap<ShelterId, number> {
  const counts = new Map<ShelterId, number>();
  for (const row of rows) counts.set(row.shelterId, (counts.get(row.shelterId) ?? 0) + 1);
  return counts;
}
