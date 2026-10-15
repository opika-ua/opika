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
 * The design (`docs/design/README.md`, the voice editor in KABINET.md)
 * specifies `{date}` and `{name}` substitution; it was never built, so a
 * sentence containing them would show the braces. Build it or amend the
 * design: inbox VH-Q1.
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
