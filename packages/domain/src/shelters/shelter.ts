import { z } from "zod";
import { ShelterIdSchema } from "../primitives/ids";
import { LocalizedTextSchema } from "../primitives/localized-text";
import { ShelterContactSchema } from "./contact";
import { DonationLinkSchema } from "./donation";
import { ShelterLegalEntitySchema } from "./legal-entity";
import { ExactAddressSchema, PublicLocationSchema } from "./location";
import { ShelterVerificationSchema } from "./verification/state";

/**
 * `exactAddress` and `contact` sit on the domain object and are excluded from
 * every public projection. That exclusion is expressed in the contract layer by
 * listing the fields a view may contain, never by subtracting the fields it may
 * not — so a field added here cannot leak by default.
 */
/**
 * A shelter's own sentence describing how current its information is.
 *
 * Written once during verification, in the shelter's own words.
 * The platform substitutes only `{date}` (last confirmed date) and
 * `{name}` (animal name). Nothing else is generated or paraphrased.
 * A shelter with no sentence falls back to the marker + day count alone.
 */
export const FreshnessSentenceSchema = LocalizedTextSchema.nullable();
export type FreshnessSentence = z.infer<typeof FreshnessSentenceSchema>;

export const ShelterSchema = z.object({
  id: ShelterIdSchema,
  displayName: z.string().min(1),
  description: LocalizedTextSchema,
  legalEntity: ShelterLegalEntitySchema,
  publicLocation: PublicLocationSchema,
  exactAddress: ExactAddressSchema,
  contact: ShelterContactSchema,
  donation: DonationLinkSchema.nullable(),
  freshnessSentence: FreshnessSentenceSchema,
  verification: ShelterVerificationSchema,
  createdAt: z.date(),
  lastUpdatedAt: z.date(),
});
export type Shelter = z.infer<typeof ShelterSchema>;
