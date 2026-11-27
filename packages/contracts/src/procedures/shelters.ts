import { ShelterIdSchema } from "@opika/domain";
import { oc } from "@orpc/contract";
import { z } from "zod";
import { apiErrors } from "../errors";
import { CityLabelViewSchema, PublicShelterViewSchema } from "../views/shelter";

export const SheltersByIdInputSchema = z.object({
  shelterId: ShelterIdSchema,
});

/**
 * Returns the public projection, which carries the shelter's city only (no
 * district, no coordinates: Oleksii, 2026-10-14, EM-Q10) and no contact
 * details. An adopter reaches the real address through a reveal.
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

/**
 * One shelter of the shelters list: the shelter page's own view, picked (no address, contact or
 * description). Only verified shelters are listed, so the page renders the verified badge itself.
 */
export const ListedShelterViewSchema = PublicShelterViewSchema.pick({
  id: true,
  displayName: true,
  logo: true,
  createdAt: true,
  publicLocation: true,
  organisationWord: true,
}).extend({
  // Built from the sitemap's animal rows, so a shelter enters only through a listed animal.
  listedAnimalCount: z.number().int().positive(),
});
export type ListedShelterView = z.infer<typeof ListedShelterViewSchema>;

/** The shelters by name, and the label of each one's own city, once each. */
export const SheltersListedOutputSchema = z.object({
  items: z.array(ListedShelterViewSchema).readonly(),
  cityLabels: z.array(CityLabelViewSchema).readonly(),
});

/**
 * Every shelter with an animal listed on the indexable (verified-only) basis: the shelters the
 * sitemap names. An early-listed or paused shelter is not in it.
 */
export const sheltersListedContract = oc
  .input(z.object({}))
  .output(SheltersListedOutputSchema)
  .errors({
    RATE_LIMITED: apiErrors.RATE_LIMITED,
  });
