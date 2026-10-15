import { ContactRevealSchema, ShelterContactSnapshotSchema } from "@opika/domain";
import type { z } from "zod";
import { PublicCityLocationViewSchema } from "./location";

/**
 * What an adopter receives of a shelter after a reveal: its name, the contact
 * channels it chose to publish, its donation link, the verification status it
 * held at that moment, and its city. Never its exact address, district or
 * coordinates.
 *
 * Oleksii, 2026-10-15 (inbox EM-B6, answer 5; recorded as decision EM-D1,
 * the revision of CLAUDE.md's decision #2), verbatim: "Exact address in the
 * reveal response: (b). Stop sending it, along with district and coordinates.
 * Decision #2 changes: the exact address never leaves the server for
 * adopters; the meeting place is agreed with the shelter (matches the live
 * copy). Record it as my decision; contract test that no reveal or public
 * response contains it." Until then this view sent the whole domain snapshot,
 * `exactAddress` (street, postcode, district, the true point) included,
 * which no adopter screen rendered: the dialog says «місце узгодите в
 * листуванні» (`reveal.meetingPlace`).
 *
 * The domain snapshot keeps the exact address (the operator's record of what
 * was true at the reveal); only this view leaves it out. Built with `pick`,
 * so a field added to the snapshot reaches adopters only when someone decides
 * it should. `publicLocation` is the same city-only view every pre-reveal
 * response carries (`PublicCityLocationViewSchema`): a reveal adds contact
 * channels, never location precision.
 *
 * The snapshot rather than the live shelter, so the record keeps showing what
 * the adopter was actually told.
 */
export const RevealShelterSnapshotViewSchema = ShelterContactSnapshotSchema.pick({
  shelterId: true,
  displayName: true,
  contact: true,
  verificationStatusAtReveal: true,
  donation: true,
}).extend({ publicLocation: PublicCityLocationViewSchema });
export type RevealShelterSnapshotView = z.infer<typeof RevealShelterSnapshotViewSchema>;

export const ContactRevealViewSchema = ContactRevealSchema.pick({
  id: true,
  animalId: true,
  revealedAt: true,
  animalSnapshot: true,
}).extend({ shelterSnapshot: RevealShelterSnapshotViewSchema });
export type ContactRevealView = z.infer<typeof ContactRevealViewSchema>;
