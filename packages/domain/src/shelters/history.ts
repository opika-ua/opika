import { z } from "zod";
import { ModeratorIdSchema } from "../primitives/ids";
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
 * Who sees it: the operator, all of it. The shelter, none of it. K5 shows a
 * rejection from the current verification state, not from here.
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
      return entry.at;
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled variant; unreachable at runtime */
    default: {
      const unreachable: never = entry;
      return unreachable;
    }
  }
};
