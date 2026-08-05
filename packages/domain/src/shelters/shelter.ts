import { z } from "zod";
import { ShelterIdSchema } from "../primitives/ids.js";
import { LocalizedTextSchema } from "../primitives/localized-text.js";
import { ShelterContactSchema } from "./contact.js";
import { DonationLinkSchema } from "./donation.js";
import { ShelterLegalEntitySchema } from "./legal-entity.js";
import { ExactAddressSchema, PublicLocationSchema } from "./location.js";
import { ShelterVerificationSchema } from "./verification/state.js";

/**
 * `exactAddress` and `contact` sit on the domain object and are excluded from
 * every public projection. That exclusion is expressed in the contract layer by
 * listing the fields a view may contain, never by subtracting the fields it may
 * not — so a field added here cannot leak by default.
 */
export const ShelterSchema = z.object({
  id: ShelterIdSchema,
  displayName: z.string().min(1),
  description: LocalizedTextSchema,
  legalEntity: ShelterLegalEntitySchema,
  publicLocation: PublicLocationSchema,
  exactAddress: ExactAddressSchema,
  contact: ShelterContactSchema,
  donation: DonationLinkSchema.nullable(),
  verification: ShelterVerificationSchema,
  createdAt: z.date(),
  lastUpdatedAt: z.date(),
});
export type Shelter = z.infer<typeof ShelterSchema>;
