import { z } from "zod";
import { ShelterIdSchema } from "../primitives/ids";
import { LocalizedTextSchema } from "../primitives/localized-text";
import { ShelterContactSchema } from "./contact";
import { DonationLinkSchema, PendingDonationSchema } from "./donation";
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
 * Written once during verification, in the shelter's own words, and
 * rendered verbatim: nothing is substituted, generated or paraphrased.
 * K2 adds one slot, `{name}`, filled with the animal's name in its base
 * form: names can't be declined, so it only fits where the nominative does
 * (VH-Q1, Oleksii, 2026-10-15). There is no `{date}`: the day count above the
 * quote already says how current it is. Until K2, nothing is filled in, and
 * a sentence containing either token would show the braces.
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
  /**
   * A proposed replacement for `donation`, awaiting the operator (H2, N20).
   * Never part of any public view: `PublicShelterViewSchema` is built with
   * `pick`, and a test asserts this field is absent from it.
   */
  pendingDonation: PendingDonationSchema.nullable(),
  freshnessSentence: FreshnessSentenceSchema,
  verification: ShelterVerificationSchema,
  createdAt: z.date(),
  lastUpdatedAt: z.date(),
  /**
   * Bumped on every audited write (H2 S3). The kabinet's writes are
   * compare-and-set on it, so two people editing the same shelter can't
   * silently overwrite each other, and a history entry's `previous` is never
   * stale. An integer rather than `lastUpdatedAt`: a timestamp guard breaks
   * the first time anything writes it at a precision JS can't round-trip.
   */
  version: z.int().nonnegative(),
});
export type Shelter = z.infer<typeof ShelterSchema>;
