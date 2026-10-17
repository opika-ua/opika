import { ContactRevealSchema, ShelterContactSnapshotSchema } from "@opika/domain";
import { z } from "zod";
import { PublicCityLocationViewSchema } from "./location";

/**
 * The contact channels a reveal view carries, and where they came from: a
 * discriminated union on `source`, so a reader of the view can't take one for
 * the other.
 *
 * - `current`: the shelter's channels as they are now. Carried while the
 *   shelter is visible (K4-B4, Oleksii, verbatim: "Reveal views and «Мої
 *   запити» show the shelter's CURRENT contacts; the snapshot stays stored as
 *   the record."), so a shelter that changes its number is reached on the new
 *   one, by people who asked before the change too. `animals.reveal` refuses
 *   a shelter that isn't visible, so it only ever answers with this.
 * - `first_reveal`: the channels stored when this adopter first revealed the
 *   animal (the reveal's stored snapshot, the record). Carried where the
 *   shelter is no longer visible, which today is a «Мої запити» item only
 *   (his words: "keep today's behaviour for those views").
 *
 * Its own field, outside the first-reveal object below (K4-B5, Oleksii,
 * verbatim: "rename shelterSnapshot.contact. While the shelter is visible it
 * holds CURRENT contacts, and "snapshot" will mislead whoever reads it next.
 * The API has no outside consumers, so rename it now (e.g. shelterContact,
 * with the stored first-reveal snapshot clearly named as the record).").
 * Chosen by the handler (`shelterContactOf`, `apps/web/src/api/handlers/reveal.ts`).
 */
export const RevealShelterContactViewSchema = z.discriminatedUnion("source", [
  ShelterContactSnapshotSchema.pick({ contact: true }).extend({ source: z.literal("current") }),
  ShelterContactSnapshotSchema.pick({ contact: true }).extend({
    source: z.literal("first_reveal"),
  }),
]);
export type RevealShelterContactView = z.infer<typeof RevealShelterContactViewSchema>;

/**
 * What an adopter receives of the shelter as it stood at their first reveal of
 * this animal, from the reveal's stored snapshot (the record): its name, its
 * donation link, the verification status it held then, and its city. Never
 * its exact address, district or coordinates. Named for when it was taken:
 * a repeat reveal returns the same stored reveal, so none of this is re-read
 * from the shelter; only `shelterContact` can be current.
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
 * The stored snapshot keeps the exact address (the operator's record of what
 * was true at the reveal); only this view leaves it out. Built with `pick`,
 * so a field added to the snapshot reaches adopters only when someone decides
 * it should. `publicLocation` is the same city-only view every pre-reveal
 * response carries (`PublicCityLocationViewSchema`): a reveal adds contact
 * channels, never location precision. Contract tests pin the exact field set
 * of this object and of the whole view.
 */
export const ShelterAtFirstRevealViewSchema = ShelterContactSnapshotSchema.pick({
  shelterId: true,
  displayName: true,
  verificationStatusAtReveal: true,
  donation: true,
}).extend({ publicLocation: PublicCityLocationViewSchema });
export type ShelterAtFirstRevealView = z.infer<typeof ShelterAtFirstRevealViewSchema>;

export const ContactRevealViewSchema = ContactRevealSchema.pick({
  id: true,
  animalId: true,
  revealedAt: true,
  animalSnapshot: true,
}).extend({
  shelterContact: RevealShelterContactViewSchema,
  shelterAtFirstReveal: ShelterAtFirstRevealViewSchema,
});
export type ContactRevealView = z.infer<typeof ContactRevealViewSchema>;
