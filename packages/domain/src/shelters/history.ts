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
import { DonationLinkSchema, DonationRemovalCodeSchema } from "./donation";
import { ShelterLegalEntitySchema } from "./legal-entity";
import { ExactAddressSchema } from "./location";
import { ShelterLogoSchema } from "./logo";
import { VerificationEventSchema } from "./verification/events";
import { EvidenceKindSchema } from "./verification/evidence";
import { VerificationStatusSchema } from "./verification/state";

/**
 * The freshness sentence a shelter used to write, kept only so old `freshness_sentence_changed`
 * entries still parse and render. Nothing writes it any more: the shelter's words are the
 * description.
 */
export const FreshnessSentenceSchema = LocalizedTextSchema.nullable();

/**
 * The fields an `animal_edited` entry can name: the kabinet's
 * `AnimalPatchSchema` keys plus `photos` (a contracts test pins the two
 * together). Photos aren't a patch key: they change through their own
 * procedures (`shelter.photos.*`, P-Q3), which record `fields: ["photos"]`.
 *
 * Names only, never values (K-Q7): a medical note or a custom temperament is
 * free text the shelter can change or clear, and append-only history would
 * keep every version of it forever. The order here is the order a history
 * line lists them in.
 */
export const ANIMAL_EDITED_FIELDS = [
  "name",
  "species",
  "sex",
  "size",
  "coatLength",
  "colour",
  "age",
  "description",
  "temperament",
  "vaccination",
  "spayNeuter",
  "medicalNotes",
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
    /** Null: added or cleared. Old entries are all non-null. */
    previous: LocalizedTextSchema.nullable(),
    next: LocalizedTextSchema.nullable(),
  }),
  /**
   * The shelter's own logo, set or cleared (pet card PR 3b). Same shape as
   * `contact_changed`/`description_changed`: an immediate, audited edit, no
   * approval step - a logo is the shelter's own mark, not a verified fact.
   *
   * Durable, but deliberately NOT a reference `r2-cleanup-repo.ts`'s
   * `referencedStorageKeys` counts - the same reasoning as
   * `contact-reveal.ts`'s `primaryPhoto`: no history-list rendering shows a
   * past logo image (this entry's own `uk` copy is text-only, "changed its
   * logo"), so an old `previous`/`next` value sitting here forever doesn't
   * keep its object alive past the grace period once nothing else points
   * at it.
   */
  z.object({
    kind: z.literal("logo_changed"),
    at: z.date(),
    actor: ShelterActorSchema,
    previous: ShelterLogoSchema.nullable(),
    next: ShelterLogoSchema.nullable(),
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
   * The operator took the live link away (money safety). Names the link that went and why, like a
   * suspension: a code plus a required note the shelter reads verbatim. `clearedPending` says a
   * waiting proposal went with it.
   */
  z.object({
    kind: z.literal("donation_removed"),
    at: z.date(),
    moderatorId: ModeratorIdSchema,
    previousLive: DonationLinkSchema,
    clearedPending: z.boolean(),
    reason: z.object({ code: DonationRemovalCodeSchema, note: z.string().min(1) }),
  }),
  /**
   * A suspension stopped the live link being live. `moved_to_pending`: nothing newer was waiting,
   * so the old link now waits for the operator; `pending_kept`: a newer proposal already waited,
   * which stays, and the old link is only recorded here.
   */
  z.object({
    kind: z.literal("donation_suspended"),
    at: z.date(),
    moderatorId: ModeratorIdSchema,
    previousLive: DonationLinkSchema,
    outcome: z.enum(["moved_to_pending", "pending_kept"]),
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
        /** Null: it was added, not changed (minimal create). */
        previous: ShelterLegalEntitySchema.nullable(),
        next: ShelterLegalEntitySchema,
      }),
      z.object({
        field: z.literal("exact_address"),
        previous: ExactAddressSchema.nullable(),
        next: ExactAddressSchema,
      }),
    ]),
  }),
  /**
   * The operator added evidence while the shelter was pending or under review.
   * Operator-only history: the shelter-facing projection omits it entirely
   * (owner, 2026-11-04). Kinds only, never contents: a reference holds a third
   * party's name and phone, and this log is append-only.
   */
  z.object({
    kind: z.literal("evidence_added"),
    at: z.date(),
    moderatorId: ModeratorIdSchema,
    items: z.array(z.object({ kind: EvidenceKindSchema })).min(1),
    statusAt: z.enum(["pending", "under_review"]),
  }),
  /**
   * The operator let the shelter's cards be public while its review runs (owner, 2026-11-04).
   * `period` is 1 or 2; the note is required for 2 and is operator-only like the entry.
   */
  z.object({
    kind: z.literal("early_listing_allowed"),
    at: z.date(),
    moderatorId: ModeratorIdSchema,
    period: z.int().min(1),
    note: z.string().min(1).nullable(),
  }),
  z.object({
    kind: z.literal("early_listing_revoked"),
    at: z.date(),
    moderatorId: ModeratorIdSchema,
  }),
  /**
   * A period ran out on its own. `at` is the expiry instant, not the write that records it: read-time
   * expiry writes nothing, so the next audited write that clears the column adds this line.
   */
  z.object({
    kind: z.literal("early_listing_lapsed"),
    at: z.date(),
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
   * The operator turned the shelter's weekly «непідтверджені картки» email off or back on, usually
   * because the shelter asked. Operator-only, like `evidence_added`: the shelter-facing history
   * does not carry it.
   */
  z.object({
    kind: z.literal("freshness_reminder_changed"),
    at: z.date(),
    moderatorId: ModeratorIdSchema,
    off: z.boolean(),
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
    case "logo_changed":
    case "donation_proposed":
    case "donation_proposal_cancelled":
    case "donation_decided":
    case "donation_removed":
    case "donation_suspended":
    case "verified_data_changed":
    case "evidence_added":
    case "early_listing_allowed":
    case "early_listing_revoked":
    case "early_listing_lapsed":
    case "display_name_changed":
    case "freshness_reminder_changed":
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

/**
 * The four history kinds that carry a departed admin's real email address -
 * the exact set GDPR erasure (option A, `docs/gdpr-analysis.md` §5 item 4)
 * scrubs when an admin with no other membership is removed. Not every
 * kind with an `email` field belongs here on principle; it happens that
 * these four are the only ones that do.
 */
export const ADMIN_EMAIL_HISTORY_KINDS = [
  "admin_invited",
  "admin_invitation_resent",
  "admin_joined",
  "admin_removed",
] as const satisfies readonly ShelterHistoryKind[];

/**
 * What a departed admin's real email is replaced with, in their shelter's
 * own history, once their account is erased (GDPR Art. 17; the decision is
 * Oleksii's, 2026-10-24: "Delete the account (when it has no other
 * membership) and scrub the email in that shelter's admin history entries
 * to the placeholder, at the moment of removal"). `.invalid` is RFC 2606's
 * reserved TLD for exactly this - guaranteed never to resolve, so it can
 * never be mistaken for a real address, and it parses as a real `z.email()`,
 * which `ShelterHistoryEntrySchema`'s own `email` field requires.
 */
export const ERASED_ADMIN_EMAIL = "removed@erased.invalid";
