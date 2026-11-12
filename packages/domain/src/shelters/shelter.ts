import { z } from "zod";
import { ShelterIdSchema } from "../primitives/ids";
import { LocalizedTextSchema } from "../primitives/localized-text";
import { ShelterContactSchema } from "./contact";
import { DonationLinkSchema, PendingDonationSchema } from "./donation";
import { type ShelterLegalEntity, ShelterLegalEntitySchema } from "./legal-entity";
import { type ExactAddress, ExactAddressSchema, PublicLocationSchema } from "./location";
import { ShelterLogoSchema } from "./logo";
import { ShelterVerificationSchema } from "./verification/state";

/**
 * `exactAddress` and `contact` sit on the domain object and are excluded from
 * every public projection. That exclusion is expressed in the contract layer by
 * listing the fields a view may contain, never by subtracting the fields it may
 * not - so a field added here cannot leak by default.
 */
export const ShelterSchema = z.object({
  id: ShelterIdSchema,
  displayName: z.string().min(1),
  /** Null when the shelter has written none; read side never caps (a longer stored text still loads). */
  description: LocalizedTextSchema.nullable(),
  /** Null until the operator adds it (minimal create); approval is refused while null (`approvalGaps`). */
  legalEntity: ShelterLegalEntitySchema.nullable(),
  publicLocation: PublicLocationSchema,
  /** Null until the operator adds it; the city is then only `publicLocation.cityId`. */
  exactAddress: ExactAddressSchema.nullable(),
  contact: ShelterContactSchema,
  donation: DonationLinkSchema.nullable(),
  /** Null until the shelter uploads one; the fallback is a client-rendered
   * initials circle (pet card PR 3b), not a stored placeholder image. */
  logo: ShelterLogoSchema.nullable(),
  /**
   * A proposed replacement for `donation`, awaiting the operator (H2, N20).
   * Never part of any public view: `PublicShelterViewSchema` is built with
   * `pick`, and a test asserts this field is absent from it.
   */
  pendingDonation: PendingDonationSchema.nullable(),
  verification: ShelterVerificationSchema,
  /** Operator permission to list before verification (nothing reads it yet); cleared on every status change. */
  earlyListingSince: z.date().nullable(),
  /**
   * Set by the operator when the shelter asks to stop the weekly «непідтверджені картки» email
   * (`freshness_reminder_off_at`); null while it is on. Operator-only: no public or shelter view
   * carries it.
   */
  freshnessReminderOffAt: z.date().nullable(),
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

/** A shelter with its verified data on file: the full onboarding path, seeds and fixtures. */
export type ShelterWithVerifiedData = Shelter & {
  legalEntity: ShelterLegalEntity;
  exactAddress: ExactAddress;
};
