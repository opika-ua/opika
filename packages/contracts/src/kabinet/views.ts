import {
  AnimalPhotoSchema,
  AnimalSchema,
  CityIdSchema,
  FreshnessSchema,
  PublishGapSchema,
  ShelterAdminIdSchema,
  ShelterFacingVerificationSchema,
  ShelterHistoryEntrySchema,
  ShelterSchema,
  VerificationStatusSchema,
} from "@opika/domain";
import { z } from "zod";

/**
 * Kabinet views (H2 S3 addendum §3). All built with `pick`, never `omit`, and
 * never `PublicShelterView` with extras bolted on: a field added to a domain
 * object reaches no kabinet screen until someone decides it should. No view
 * carries a reveal, swipe or view count (commitment #2); a contract test pins
 * each view's exact key list.
 */

/** K2 row: inventory only. `freshness` is null for listings an adopter can't see. */
export const KabinetAnimalRowViewSchema = AnimalSchema.pick({
  id: true,
  name: true,
  species: true,
  sex: true,
  size: true,
  listing: true,
  lastUpdatedAt: true,
}).extend({
  coverPhoto: AnimalPhotoSchema.nullable(),
  freshness: FreshnessSchema.nullable(),
  publishGaps: z.array(PublishGapSchema).readonly(),
});
export type KabinetAnimalRowView = z.infer<typeof KabinetAnimalRowViewSchema>;

/** K3: every field the edit form shows, listed explicitly. */
export const KabinetAnimalViewSchema = AnimalSchema.pick({
  id: true,
  name: true,
  species: true,
  sex: true,
  size: true,
  age: true,
  description: true,
  photos: true,
  vaccination: true,
  spayNeuter: true,
  documentReadiness: true,
  listing: true,
  publicLocation: true,
  createdAt: true,
  lastUpdatedAt: true,
  version: true,
});
export type KabinetAnimalView = z.infer<typeof KabinetAnimalViewSchema>;

/**
 * K4: what a shelter sees of itself. Legal entity and premises address appear
 * read-only in the locked block; verification is the shelter-facing projection
 * (no evidence, no moderator ids). `version` goes out so a write can send back
 * what it read.
 */
export const KabinetShelterViewSchema = ShelterSchema.pick({
  id: true,
  displayName: true,
  description: true,
  legalEntity: true,
  exactAddress: true,
  contact: true,
  donation: true,
  pendingDonation: true,
  freshnessSentence: true,
  version: true,
}).extend({ verification: ShelterFacingVerificationSchema });
export type KabinetShelterView = z.infer<typeof KabinetShelterViewSchema>;

/** S1 row. `animalCount` is inventory, which is allowed; it is not engagement. */
export const RegistryShelterRowViewSchema = ShelterSchema.pick({
  id: true,
  displayName: true,
  createdAt: true,
}).extend({
  status: VerificationStatusSchema,
  cityId: CityIdSchema,
  animalCount: z.int().nonnegative(),
});
export type RegistryShelterRowView = z.infer<typeof RegistryShelterRowViewSchema>;

export const ShelterAdminViewSchema = z.object({
  id: ShelterAdminIdSchema,
  name: z.string().min(1),
  email: z.email(),
  invite: z.discriminatedUnion("status", [
    z.object({ status: z.literal("pending"), expiresAt: z.date() }),
    z.object({ status: z.literal("accepted") }),
  ]),
});
export type ShelterAdminView = z.infer<typeof ShelterAdminViewSchema>;

/** S3/S4: operator-only, the full record including evidence and moderator ids. */
export const RegistryShelterViewSchema = ShelterSchema.pick({
  id: true,
  displayName: true,
  description: true,
  legalEntity: true,
  publicLocation: true,
  exactAddress: true,
  contact: true,
  donation: true,
  pendingDonation: true,
  freshnessSentence: true,
  verification: true,
  createdAt: true,
  lastUpdatedAt: true,
  version: true,
}).extend({ admins: z.array(ShelterAdminViewSchema).readonly() });
export type RegistryShelterView = z.infer<typeof RegistryShelterViewSchema>;

/** Operator-only. Already shape-only in S2b; the history table ships with its writers. */
export const HistoryEntryViewSchema = ShelterHistoryEntrySchema;
