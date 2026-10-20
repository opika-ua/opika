import { z } from "zod";
import { type WithdrawalReason, WithdrawalReasonSchema } from "../animals/listing";
import { LISTING_KINDS } from "../animals/listing-transition";
import {
  AnimalIdSchema,
  InvitationIdSchema,
  ModeratorIdSchema,
  ShelterAdminIdSchema,
} from "../primitives/ids";
import { LocalizedTextSchema } from "../primitives/localized-text";
import { ShelterActorSchema } from "./actor";
import { ShelterContactSchema } from "./contact";
import { DonationLinkSchema } from "./donation";
import { ShelterLegalEntitySchema } from "./legal-entity";
import { ExactAddressSchema } from "./location";
import { FreshnessSentenceSchema } from "./shelter";
import { VerificationEventSchema } from "./verification/events";
import { VerificationStatusSchema } from "./verification/state";

/**
 * The fields an `animal_edited` entry can name: the kabinet's
 * `AnimalPatchSchema` keys plus `photos` (a contracts test pins the two
 * together). Photos aren't a patch key: they change through their own
 * procedures (`shelter.photos.*`, P-Q3), which record `fields: ["photos"]`.
 */
export const ANIMAL_EDITED_FIELDS = [
  "name",
  "species",
  "sex",
  "size",
  "coatLength",
  "age",
  "description",
  "vaccination",
  "spayNeuter",
  "photos",
] as const;
export type AnimalEditedField = (typeof ANIMAL_EDITED_FIELDS)[number];

/**
 * A withdrawal's reason as history keeps it: the code, never the shelter's
 * free-text note. History is append-only and can't be erased, and a note
 * like «забрала пані Олена» names an adopter (K-Q7: "never adopter data";
 * review finding 5, inbox K-Q18). The listing state still carries the note.
 */
export const HistoryWithdrawalReasonSchema = WithdrawalReasonSchema.pick({ code: true });

/** A listing move as history records it: the event's type, and a withdrawal's code only. */
export const AnimalListingHistoryEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("publish") }),
  z.object({ type: z.literal("reserve") }),
  z.object({ type: z.literal("release") }),
  z.object({ type: z.literal("adopt") }),
  z.object({ type: z.literal("withdraw"), reason: HistoryWithdrawalReasonSchema }),
  z.object({ type: z.literal("restore_to_draft") }),
]);
export type AnimalListingHistoryEvent = z.infer<typeof AnimalListingHistoryEventSchema>;

/**
 * Builds the recorded event field by field. The write path stores the entry
 * as JSON without parsing it, so passing the requested event through whole
 * would carry its note into history; this is the one place that decides
 * what's kept.
 */
export const listingHistoryEventOf = (
  event:
    | { readonly type: Exclude<AnimalListingHistoryEvent["type"], "withdraw"> }
    | { readonly type: "withdraw"; readonly reason: WithdrawalReason },
): AnimalListingHistoryEvent =>
  event.type === "withdraw"
    ? { type: "withdraw", reason: { code: event.reason.code } }
    : { type: event.type };

/**
 * One line of a shelter's history: what the operator reads on S3/S4
 * (KABINET N14, N23). Append-only. The current state lives on the shelter;
 * this is how it got there.
 *
 * **Structured snapshots, not free text and not field diffs** (H2 proposal
 * §3). Free text would mean writing Ukrainian into the database at write
 * time, which breaks i18n. A diff over `ShelterContact` (itself a union of
 * channels) costs more than whole-value snapshots and buys nothing a
 * human-readable history list needs. Each entry renders through i18n at read
 * time.
 *
 * Hand-wired per kind, not a generic field-audit framework: H2 has exactly
 * these call sites. A new auditable field is a new variant, and the compiler
 * then finds every renderer.
 *
 * Who sees it: the operator, all of it. The shelter sees it too since RG-Q8,
 * through `shelterFacingHistoryOf`: no evidence and no ids (moderator, admin
 * or invitation). K5 shows a rejection from the current verification state,
 * not from here.
 *
 * Only the shape lives here. Its table ships with its first writer (the
 * kabinet's registry procedures), not ahead of it.
 */
export const ShelterHistoryEntrySchema = z.discriminatedUnion("kind", [
  /** Every verification transition. The event is stored whole: it already carries who, when and why. */
  z.object({
    kind: z.literal("verification"),
    event: VerificationEventSchema,
    from: VerificationStatusSchema,
    to: VerificationStatusSchema,
  }),
  z.object({
    kind: z.literal("contact_changed"),
    at: z.date(),
    actor: ShelterActorSchema,
    previous: ShelterContactSchema,
    next: ShelterContactSchema,
  }),
  z.object({
    kind: z.literal("freshness_sentence_changed"),
    at: z.date(),
    actor: ShelterActorSchema,
    previous: FreshnessSentenceSchema,
    next: FreshnessSentenceSchema,
  }),
  /** Decisions §5: "contacts and descriptions" go live immediately and are audited. */
  z.object({
    kind: z.literal("description_changed"),
    at: z.date(),
    actor: ShelterActorSchema,
    previous: LocalizedTextSchema,
    next: LocalizedTextSchema,
  }),
  z.object({
    kind: z.literal("donation_proposed"),
    at: z.date(),
    actor: ShelterActorSchema,
    link: DonationLinkSchema,
  }),
  z.object({
    kind: z.literal("donation_proposal_cancelled"),
    at: z.date(),
    actor: ShelterActorSchema,
  }),
  /** The operator's approve/reject on S4 (N20). No reason: a value swap, not a state transition. */
  z.object({
    kind: z.literal("donation_decided"),
    at: z.date(),
    moderatorId: ModeratorIdSchema,
    decision: z.enum(["approved", "rejected"]),
    link: DonationLinkSchema,
    previousLive: DonationLinkSchema.nullable(),
  }),
  /**
   * The operator editing what verification checked (S4). No approval step:
   * the operator is already the authority, with no one above to ask
   * (decisions §5). The record of the change is the safeguard.
   */
  z.object({
    kind: z.literal("verified_data_changed"),
    at: z.date(),
    moderatorId: ModeratorIdSchema,
    change: z.discriminatedUnion("field", [
      z.object({
        field: z.literal("legal_entity"),
        previous: ShelterLegalEntitySchema,
        next: ShelterLegalEntitySchema,
      }),
      z.object({
        field: z.literal("exact_address"),
        previous: ExactAddressSchema,
        next: ExactAddressSchema,
      }),
    ]),
  }),
  /**
   * The operator renamed the shelter on S4 (R-UI 4; Oleksii, R-UI answer 8,
   * verbatim: "Yes: rename as R-UI 4, with a history line."). The display
   * name is public (every card names the shelter by it), so a change is
   * recorded like the other operator edits. Operator only, hence
   * `moderatorId` rather than an actor: no shelter-side procedure renames.
   * Both names are kept, as the other changes keep both values: the line
   * still says what the shelter was called after any later rename.
   */
  z.object({
    kind: z.literal("display_name_changed"),
    at: z.date(),
    moderatorId: ModeratorIdSchema,
    from: z.string().min(1),
    to: z.string().min(1),
  }),
  /**
   * The shelter came into being, created by the operator through the
   * registry (S2) or entered by a script on the shelter's behalf (RG-Q8).
   */
  z.object({
    kind: z.literal("shelter_created"),
    at: z.date(),
    moderatorId: ModeratorIdSchema,
    via: z.enum(["registry", "script"]),
  }),
  /** The operator invited an admin (registry.admins.invite). */
  z.object({
    kind: z.literal("admin_invited"),
    at: z.date(),
    moderatorId: ModeratorIdSchema,
    email: z.email(),
  }),
  z.object({
    kind: z.literal("admin_invitation_resent"),
    at: z.date(),
    moderatorId: ModeratorIdSchema,
    email: z.email(),
  }),
  /**
   * An invited person accepted and became the shelter's admin (IN-Q14).
   * Written only by the accept's own atomic statement (IN-Q12/IN-Q13), never
   * after it. The joining user is the actor, so one id, not two. The email is
   * the invitation's at join time, stored like its siblings' because history
   * records what happened: resolving it at read time would show a changed
   * address, or nothing, and so rewrite the record.
   */
  z.object({
    kind: z.literal("admin_joined"),
    at: z.date(),
    shelterAdminId: ShelterAdminIdSchema,
    invitationId: InvitationIdSchema,
    email: z.email(),
  }),
  /**
   * An admin removed, or a pending invitation withdrawn (RG-Q6, RG-Q3).
   * Removing the last admin is allowed, and recorded like any other.
   */
  z.object({
    kind: z.literal("admin_removed"),
    at: z.date(),
    moderatorId: ModeratorIdSchema,
    email: z.email(),
    wasPending: z.boolean(),
  }),
  /**
   * A script entered new animals on the shelter's behalf (RG-Q8, RS-Q0). One
   * entry per batch, with a count: no script edits an existing animal, and
   * one that ever does records per-animal entries instead.
   */
  z.object({
    kind: z.literal("animals_imported"),
    at: z.date(),
    moderatorId: ModeratorIdSchema,
    count: z.int().positive(),
  }),
  /*
   * A shelter's own animal writes (K-Q7, Oleksii: "creation, deletion, every
   * listing move; edits record field names only; never adopter data"). Each
   * carries the animal's name at the time, so the history still reads after
   * the animal is renamed or deleted. «Ще шукає» and its undo are not
   * recorded (S1): the confirmation date itself is that record.
   */
  z.object({
    kind: z.literal("animal_created"),
    at: z.date(),
    actor: ShelterActorSchema,
    animalId: AnimalIdSchema,
    animalName: z.string().min(1),
  }),
  /** Which fields changed, never their values (K-Q7). */
  z.object({
    kind: z.literal("animal_edited"),
    at: z.date(),
    actor: ShelterActorSchema,
    animalId: AnimalIdSchema,
    animalName: z.string().min(1),
    fields: z.array(z.enum(ANIMAL_EDITED_FIELDS)).min(1),
  }),
  z.object({
    kind: z.literal("animal_listing_changed"),
    at: z.date(),
    actor: ShelterActorSchema,
    animalId: AnimalIdSchema,
    animalName: z.string().min(1),
    event: AnimalListingHistoryEventSchema,
    from: z.enum(LISTING_KINDS),
    to: z.enum(LISTING_KINDS),
  }),
  z.object({
    kind: z.literal("animal_deleted"),
    at: z.date(),
    actor: ShelterActorSchema,
    animalId: AnimalIdSchema,
    animalName: z.string().min(1),
  }),
]);
export type ShelterHistoryEntry = z.infer<typeof ShelterHistoryEntrySchema>;
export type ShelterHistoryKind = ShelterHistoryEntry["kind"];

/** When an entry happened. A verification entry's instant is its event's. Newest-first lists sort on this. */
export const historyEntryAt = (entry: ShelterHistoryEntry): Date => {
  switch (entry.kind) {
    case "verification":
      return entry.event.at;
    case "contact_changed":
    case "freshness_sentence_changed":
    case "description_changed":
    case "donation_proposed":
    case "donation_proposal_cancelled":
    case "donation_decided":
    case "verified_data_changed":
    case "display_name_changed":
    case "shelter_created":
    case "admin_invited":
    case "admin_invitation_resent":
    case "admin_joined":
    case "admin_removed":
    case "animals_imported":
    case "animal_created":
    case "animal_edited":
    case "animal_listing_changed":
    case "animal_deleted":
      return entry.at;
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled variant; unreachable at runtime */
    default: {
      const unreachable: never = entry;
      return unreachable;
    }
  }
};
