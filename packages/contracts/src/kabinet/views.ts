import {
  AnimalPhotoSchema,
  AnimalSchema,
  CityIdSchema,
  FreshnessSchema,
  PublishGapSchema,
  ShelterAdminIdSchema,
  ShelterFacingHistoryItemSchema,
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

/**
 * Why an email was not handed to the provider for delivery. Provider-neutral
 * names: the provider's own codes are mapped in the app's email module.
 */
export const EMAIL_BLOCK_REASONS = [
  "unsubscribed",
  "hard_bounce",
  "spam_complaint",
  "admin_blocked",
] as const;

/**
 * What became of one operator-triggered invitation email (IN-E7, Oleksii,
 * 2026-10-14: "the operator UI shows the send result directly"). The
 * operator typed the address, so reporting it leaks nothing.
 *
 * `sent` means the provider accepted it, not that it reached an inbox: no
 * provider can say that synchronously. Its `blockCheck` says whether the
 * block list was actually read first: `clear` means the address was looked
 * up and isn't on it; `unknown` means the lookup failed, timed out, or the
 * list was too long to read, and the email went anyway (IN-E11). A provider
 * accepts a send to a blocked address and then drops it (IN-E7), so `unknown`
 * is exactly the case where `sent` may not arrive, and the operator is told
 * so rather than shown a plain `sent`. `blocked` means the provider holds the
 * address on its block list, so nothing was sent; `failed` means the provider
 * refused or didn't answer (`provider_error`), or the text was still a
 * placeholder in production (`copy_pending`, IN-Q5). The invitation itself is
 * written either way; a resend retries the email.
 */
export const EmailSendOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("sent"), blockCheck: z.enum(["clear", "unknown"]) }),
  z.object({ kind: z.literal("blocked"), reason: z.enum(EMAIL_BLOCK_REASONS) }),
  z.object({ kind: z.literal("failed"), reason: z.enum(["provider_error", "copy_pending"]) }),
]);
export type EmailSendOutcome = z.infer<typeof EmailSendOutcomeSchema>;

/** `registry.admins.invite`: the admin, plus what became of this call's email. */
export const InvitedAdminViewSchema = ShelterAdminViewSchema.extend({
  invitationEmail: EmailSendOutcomeSchema,
});
export type InvitedAdminView = z.infer<typeof InvitedAdminViewSchema>;

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

/**
 * `registry.shelters.create`: the record, plus what became of the first
 * admin's invitation email. Null when no invitation was written (the
 * first admin's address was taken by a race after the pre-check), which the
 * empty `admins` list already shows.
 */
export const CreatedShelterViewSchema = RegistryShelterViewSchema.extend({
  firstAdminInvitationEmail: EmailSendOutcomeSchema.nullable(),
});
export type CreatedShelterView = z.infer<typeof CreatedShelterViewSchema>;

/** Operator-only. Already shape-only in S2b; the history table ships with its writers. */
export const HistoryEntryViewSchema = ShelterHistoryEntrySchema;

/**
 * A line of the shelter's own history (RG-Q8): the domain projection, with no
 * evidence and no moderator ids, the operator shown by display name. A
 * contract test pins every variant's key set.
 */
export const ShelterHistoryItemViewSchema = ShelterFacingHistoryItemSchema;
export type ShelterHistoryItemView = z.infer<typeof ShelterHistoryItemViewSchema>;
