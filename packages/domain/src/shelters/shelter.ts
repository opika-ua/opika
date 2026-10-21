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
 * Written in the shelter's own words and rendered as written: nothing is
 * generated, paraphrased or filled in. It belongs to the shelter, not to an
 * animal, and shows on the shelter page only (designer round 1, DR1-Q1); the
 * `{імʼя}` slot it used to carry is refused since DR1-Q5
 * (`ANIMAL_NAME_TOKEN`). There is no `{date}`: every card's day count already
 * says how current it is. Every write path checks the text with
 * `normalizeFreshnessSentenceText`, so what is stored from now on holds no
 * braces; this schema itself stays the stored shape and doesn't re-check it.
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
