import { z } from "zod";
import { AnimalPhotoSchema } from "../animals/photo";
import {
  AdopterIdSchema,
  AnimalIdSchema,
  RevealIdSchema,
  ShelterIdSchema,
} from "../primitives/ids";
import { ShelterContactSchema } from "../shelters/contact";
import { DonationLinkSchema } from "../shelters/donation";
import { ExactAddressSchema, PublicLocationSchema } from "../shelters/location";
import { VERIFICATION_STATUSES } from "../shelters/verification/state";

/**
 * Denormalised on purpose. If a shelter changes its phone number, the record
 * should still hold what the adopter was told — otherwise the record of a
 * conversation contradicts the conversation. (What the adopter is *shown*
 * is a separate question: the shelter's current contacts while it is
 * visible, K4-B4. This stays the record either way.)
 *
 * `verificationStatusAtReveal` is captured for the same reason: a shelter
 * suspended next month was verified at the moment this adopter was pointed at
 * it, and both facts matter when investigating a complaint.
 */
export const ShelterContactSnapshotSchema = z.object({
  shelterId: ShelterIdSchema,
  displayName: z.string().min(1),
  contact: ShelterContactSchema,
  exactAddress: ExactAddressSchema,
  publicLocation: PublicLocationSchema,
  /**
   * Derived from the lifecycle rather than restated, so adding a status cannot
   * leave this list quietly behind — which is exactly what happened when
   * `paused` was introduced.
   */
  verificationStatusAtReveal: z.enum(VERIFICATION_STATUSES),
  donation: DonationLinkSchema.nullable(),
});
export type ShelterContactSnapshot = z.infer<typeof ShelterContactSnapshotSchema>;

/** Enough for the history list to stay readable after an animal is adopted. */
export const AnimalRevealSnapshotSchema = z.object({
  name: z.string().min(1),
  primaryPhoto: AnimalPhotoSchema.nullable(),
});
export type AnimalRevealSnapshot = z.infer<typeof AnimalRevealSnapshotSchema>;

/**
 * An append-only event, never updated. That is what makes it usable as an
 * audit record, as analytics, and later as the entry in a reward ledger.
 *
 * The snapshot keeps the shelter's exact address as the operator's record of
 * what was true at the reveal. It never reaches the adopter: the contract's
 * reveal view picks the contact channels and the city only (Oleksii,
 * 2026-10-15, inbox EM-B6 answer 5, decision EM-D1: "the exact address never
 * leaves the server for adopters; the meeting place is agreed with the
 * shelter"). The contact details are what a reveal discloses, and only after
 * the adopter has committed to it.
 */
export const ContactRevealSchema = z.object({
  id: RevealIdSchema,
  adopterId: AdopterIdSchema,
  animalId: AnimalIdSchema,
  /**
   * Duplicated from the snapshot on purpose: this is the indexed foreign key,
   * the snapshot keeps the frozen historical copy.
   *
   * Reaching the shelter by joining through the animal would be wrong as well
   * as slow — the animal can be withdrawn or moved, and the reveal is a record
   * of what was true at the time. The queries that need it are the shelter's
   * own reveal count, abuse investigation across a suspended shelter, and the
   * reward ledger, which credits the shelter rather than the animal.
   */
  shelterId: ShelterIdSchema,
  revealedAt: z.date(),
  /**
   * The first-reveal record: written once, at this adopter's first reveal of
   * the animal, and never rewritten. Since K4-B4 an adopter is shown the
   * shelter's current contacts while it is visible, so this is the record of
   * what they were told then, not necessarily what they see now; the
   * contract's view says which they got (`shelterContact.source`, K4-B5).
   */
  shelterSnapshot: ShelterContactSnapshotSchema,
  animalSnapshot: AnimalRevealSnapshotSchema,
});
export type ContactReveal = z.infer<typeof ContactRevealSchema>;
