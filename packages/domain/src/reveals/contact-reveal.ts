import { z } from "zod";
import { AnimalPhotoSchema } from "../animals/photo.js";
import {
  AdopterIdSchema,
  AnimalIdSchema,
  RevealIdSchema,
  ShelterIdSchema,
} from "../primitives/ids.js";
import { ShelterContactSchema } from "../shelters/contact.js";
import { DonationLinkSchema } from "../shelters/donation.js";
import { ExactAddressSchema, PublicLocationSchema } from "../shelters/location.js";
import { VERIFICATION_STATUSES } from "../shelters/verification/state.js";

/**
 * Denormalised on purpose. If a shelter changes its phone number, an adopter's
 * history should still show what they were told — otherwise the record of a
 * conversation contradicts the conversation.
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
 * This is also the only path by which a shelter's exact address reaches an
 * adopter — after they have committed to the reveal, never in the feed.
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
  shelterSnapshot: ShelterContactSnapshotSchema,
  animalSnapshot: AnimalRevealSnapshotSchema,
});
export type ContactReveal = z.infer<typeof ContactRevealSchema>;
