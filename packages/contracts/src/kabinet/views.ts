import {
  AnimalPhotoSchema,
  CityIdSchema,
  DraftAnimalSchema,
  FreshnessSchema,
  ListedAnimalSchema,
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

/*
 * The animal views are a union of two `pick`s with one field list (F-B1,
 * decision taken T2): a draft's view may carry a null size, age or
 * description, and a listed animal's may not, so the K3 form receives the
 * same typed union the domain has, and `pick` stays the only builder. Zod
 * can't `pick` from a union, hence one list applied to each half.
 */

/** K2 row: inventory only. `freshness` is null for listings an adopter can't see. */
const ANIMAL_ROW_FIELDS = {
  id: true,
  name: true,
  species: true,
  sex: true,
  size: true,
  listing: true,
  lastUpdatedAt: true,
} as const;
const animalRowExtras = {
  coverPhoto: AnimalPhotoSchema.nullable(),
  freshness: FreshnessSchema.nullable(),
  publishGaps: z.array(PublishGapSchema).readonly(),
};
export const KabinetAnimalRowViewSchema = z.union([
  DraftAnimalSchema.pick(ANIMAL_ROW_FIELDS).extend(animalRowExtras),
  ListedAnimalSchema.pick(ANIMAL_ROW_FIELDS).extend(animalRowExtras),
]);
export type KabinetAnimalRowView = z.infer<typeof KabinetAnimalRowViewSchema>;

/** K3: every field the edit form shows, listed explicitly. */
const ANIMAL_VIEW_FIELDS = {
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
} as const;
export const KabinetDraftAnimalViewSchema = DraftAnimalSchema.pick(ANIMAL_VIEW_FIELDS);
export const KabinetListedAnimalViewSchema = ListedAnimalSchema.pick(ANIMAL_VIEW_FIELDS);
export const KabinetAnimalViewSchema = z.union([
  KabinetDraftAnimalViewSchema,
  KabinetListedAnimalViewSchema,
]);
export type KabinetDraftAnimalView = z.infer<typeof KabinetDraftAnimalViewSchema>;
export type KabinetListedAnimalView = z.infer<typeof KabinetListedAnimalViewSchema>;
export type KabinetAnimalView = KabinetDraftAnimalView | KabinetListedAnimalView;

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

/**
 * S1 row. `animalCount` is inventory, which is allowed; it is not engagement.
 *
 * `admins` and `donationPending` (Oleksii, R-UI answer 2, verbatim: "Yes: add
 * the admins count (signed in / invited) and the donationPending flag to the
 * list row, in one query (no N+1)."). `admins` counts as S4's admin list
 * does: `joined` is the members, `invited` every address with a pending
 * invitation and no membership, expired invitations included (S4 offers a
 * resend for those), each address once. `donationPending` says why a verified
 * shelter can sort first: a proposed link is waiting for the operator's
 * decision (the list's rank already counts it).
 */
export const RegistryShelterRowViewSchema = ShelterSchema.pick({
  id: true,
  displayName: true,
  createdAt: true,
}).extend({
  status: VerificationStatusSchema,
  cityId: CityIdSchema,
  animalCount: z.int().nonnegative(),
  admins: z.object({ joined: z.int().nonnegative(), invited: z.int().nonnegative() }),
  donationPending: z.boolean(),
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

/**
 * After an invitation email is handed to the provider, the operator is
 * reminded to tell the shelter personally (IN-E6/IN-E13): the delivery test's
 * invite landed in Gmail's Promotions tab, so a volunteer may never see it
 * unless someone says where to look. `text` is the app's catalogue string
 * with the sending address filled in, so the operator can paste it as is.
 *
 * Present on every `sent`, `blockCheck: "unknown"` included: the email did
 * go, and an unchecked send is the case most in need of a personal word.
 * Null when nothing was sent (`blocked`, `failed`): there is nothing to point
 * the shelter at.
 */
export const InvitationReminderSchema = z
  .object({ kind: z.literal("tell_personally"), text: z.string().min(1) })
  .nullable();
export type InvitationReminder = z.infer<typeof InvitationReminderSchema>;

/** `registry.admins.invite`: the admin, plus what became of this call's email and the reminder that follows a send. */
export const InvitedAdminViewSchema = ShelterAdminViewSchema.extend({
  invitationEmail: EmailSendOutcomeSchema,
  invitationReminder: InvitationReminderSchema,
});
export type InvitedAdminView = z.infer<typeof InvitedAdminViewSchema>;

/**
 * `registry.admins.blockedAddresses` (Oleksii, 2026-10-14, answer 4: "The
 * registry screen shows Brevo-blocked addresses by querying Brevo's
 * blocked-contacts API when the screen loads."): which of one shelter's
 * admin and invited addresses the provider holds on its block list, so the
 * operator sees a volunteer who can no longer receive sign-in emails before
 * she has to write in.
 *
 * Three answers, and an empty list belongs to only one of them:
 * - `checked`: the whole list was read; `blocked` is every match, and an
 *   empty one really means none of these addresses is blocked.
 * - `incomplete`: the list is longer than the pages read (Oleksii: "on
 *   hitting the cap, return a typed "incomplete" result, not a partial "none
 *   blocked""). `blockedSoFar` is what the read pages showed; anyone else may
 *   still be blocked.
 * - `unknown`: the list couldn't be read (Oleksii: "If Brevo is unreachable or
 *   errors, return a typed "unknown", never an empty list."), or the
 *   configured provider has no list to read (`unsupported_provider`), or
 *   it filters on a list of its own that isn't read (`provider_suppresses`:
 *   the provider drops mail to suppressed addresses, so "unknown" here does
 *   not mean "unfiltered").
 *
 * `asOf` is when the list was read: it is cached for a few minutes, so a
 * just-unblocked address may still show until then.
 */
const BlockedAddressSchema = z.object({ email: z.email(), reason: z.enum(EMAIL_BLOCK_REASONS) });
export const BlockedAddressesViewSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("checked"),
    asOf: z.date(),
    blocked: z.array(BlockedAddressSchema).readonly(),
  }),
  z.object({
    kind: z.literal("incomplete"),
    asOf: z.date(),
    blockedSoFar: z.array(BlockedAddressSchema).readonly(),
  }),
  z.object({
    kind: z.literal("unknown"),
    why: z.enum(["provider_error", "timed_out", "unsupported_provider", "provider_suppresses"]),
  }),
]);
export type BlockedAddressesView = z.infer<typeof BlockedAddressesViewSchema>;

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
  /** Null with the outcome above, and whenever that outcome isn't `sent`. */
  firstAdminInvitationReminder: InvitationReminderSchema,
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
