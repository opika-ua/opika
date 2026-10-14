import { z } from "zod";
import { LocalizedTextSchema } from "../primitives/localized-text";
import { ShelterContactSchema } from "./contact";
import { DonationLinkSchema } from "./donation";
import type { ShelterHistoryEntry } from "./history";
import { ShelterLegalEntitySchema } from "./legal-entity";
import { ExactAddressSchema } from "./location";
import { FreshnessSentenceSchema } from "./shelter";
import {
  PauseReasonSchema,
  RejectionReasonSchema,
  SuspensionReasonSchema,
} from "./verification/reasons";
import { VerificationStatusSchema } from "./verification/state";

/**
 * Who did it, as the shelter is shown it (RG-Q8): the operator by display
 * name, or the shelter itself. Never an id. The name is passed in by the app
 * (`KABINET_OPERATOR_DISPLAY_NAME`, RS-Q2), never read from the row.
 */
export const HistoryActorViewSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("operator"), displayName: z.string().min(1) }),
  z.object({ kind: z.literal("shelter") }),
]);
export type HistoryActorView = z.infer<typeof HistoryActorViewSchema>;

const base = { at: z.date(), actor: HistoryActorViewSchema };

/**
 * One line of a shelter's own history, as the shelter sees it (RG-Q8,
 * `docs/h2-registry-shapes.md` §2). Every variant is built field by field
 * from its entry: **no evidence and no ids** (moderator, admin, invitation),
 * at any depth. A verification entry keeps its states, the event's type and
 * its reason (which the shelter already sees verbatim, S3-Q2); a
 * resubmission's evidence list and every reviewer/moderator id are dropped.
 */
export const ShelterFacingHistoryItemSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("verification"),
    ...base,
    from: VerificationStatusSchema,
    to: VerificationStatusSchema,
    event: z.enum([
      "start_review",
      "approve",
      "reject",
      "resubmit",
      "suspend",
      "reinstate",
      "pause",
      "resume",
    ]),
    reason: z.union([RejectionReasonSchema, SuspensionReasonSchema, PauseReasonSchema]).nullable(),
  }),
  z.object({
    kind: z.literal("contact_changed"),
    ...base,
    previous: ShelterContactSchema,
    next: ShelterContactSchema,
  }),
  z.object({
    kind: z.literal("freshness_sentence_changed"),
    ...base,
    previous: FreshnessSentenceSchema,
    next: FreshnessSentenceSchema,
  }),
  z.object({
    kind: z.literal("description_changed"),
    ...base,
    previous: LocalizedTextSchema,
    next: LocalizedTextSchema,
  }),
  z.object({ kind: z.literal("donation_proposed"), ...base, link: DonationLinkSchema }),
  z.object({ kind: z.literal("donation_proposal_cancelled"), ...base }),
  z.object({
    kind: z.literal("donation_decided"),
    ...base,
    decision: z.enum(["approved", "rejected"]),
    link: DonationLinkSchema,
    previousLive: DonationLinkSchema.nullable(),
  }),
  z.object({
    kind: z.literal("verified_data_changed"),
    ...base,
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
  z.object({ kind: z.literal("shelter_created"), ...base }),
  z.object({ kind: z.literal("admin_invited"), ...base, email: z.email() }),
  z.object({ kind: z.literal("admin_invitation_resent"), ...base, email: z.email() }),
  /** The email stored at join time (IN-Q14); the admin's and the invitation's ids stay operator-only. */
  z.object({ kind: z.literal("admin_joined"), ...base, email: z.email() }),
  z.object({
    kind: z.literal("admin_removed"),
    ...base,
    email: z.email(),
    wasPending: z.boolean(),
  }),
  z.object({ kind: z.literal("animals_imported"), ...base, count: z.int().positive() }),
]);
export type ShelterFacingHistoryItem = z.infer<typeof ShelterFacingHistoryItemSchema>;

/**
 * Projects one history entry for the shelter. Field by field, never a spread
 * with deletions: a field added to an entry later can't reach the shelter by
 * default (the same reasoning as `pick` over `omit`).
 */
export function shelterFacingHistoryOf(
  entry: ShelterHistoryEntry,
  operatorDisplayName: string,
): ShelterFacingHistoryItem {
  const operator: HistoryActorView = { kind: "operator", displayName: operatorDisplayName };
  const shelterActorView = (actor: { kind: "moderator" | "shelter_admin" }): HistoryActorView =>
    actor.kind === "moderator" ? operator : { kind: "shelter" };

  switch (entry.kind) {
    case "verification": {
      const { event } = entry;
      const actor =
        event.type === "pause" || event.type === "resume" || event.type === "resubmit"
          ? shelterActorView(event.actor)
          : operator;
      const reason =
        event.type === "reject" || event.type === "suspend" || event.type === "pause"
          ? event.reason
          : null;
      return {
        kind: "verification",
        at: event.at,
        actor,
        from: entry.from,
        to: entry.to,
        event: event.type,
        reason,
      };
    }
    case "contact_changed":
      return {
        kind: "contact_changed",
        at: entry.at,
        actor: shelterActorView(entry.actor),
        previous: entry.previous,
        next: entry.next,
      };
    case "freshness_sentence_changed":
      return {
        kind: "freshness_sentence_changed",
        at: entry.at,
        actor: shelterActorView(entry.actor),
        previous: entry.previous,
        next: entry.next,
      };
    case "description_changed":
      return {
        kind: "description_changed",
        at: entry.at,
        actor: shelterActorView(entry.actor),
        previous: entry.previous,
        next: entry.next,
      };
    case "donation_proposed":
      return {
        kind: "donation_proposed",
        at: entry.at,
        actor: shelterActorView(entry.actor),
        link: entry.link,
      };
    case "donation_proposal_cancelled":
      return {
        kind: "donation_proposal_cancelled",
        at: entry.at,
        actor: shelterActorView(entry.actor),
      };
    case "donation_decided":
      return {
        kind: "donation_decided",
        at: entry.at,
        actor: operator,
        decision: entry.decision,
        link: entry.link,
        previousLive: entry.previousLive,
      };
    case "verified_data_changed":
      return { kind: "verified_data_changed", at: entry.at, actor: operator, change: entry.change };
    case "shelter_created":
      return { kind: "shelter_created", at: entry.at, actor: operator };
    case "admin_invited":
      return { kind: "admin_invited", at: entry.at, actor: operator, email: entry.email };
    case "admin_invitation_resent":
      return { kind: "admin_invitation_resent", at: entry.at, actor: operator, email: entry.email };
    case "admin_joined":
      return { kind: "admin_joined", at: entry.at, actor: { kind: "shelter" }, email: entry.email };
    case "admin_removed":
      return {
        kind: "admin_removed",
        at: entry.at,
        actor: operator,
        email: entry.email,
        wasPending: entry.wasPending,
      };
    case "animals_imported":
      return { kind: "animals_imported", at: entry.at, actor: operator, count: entry.count };
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled variant; unreachable at runtime */
    default: {
      const unreachable: never = entry;
      return unreachable;
    }
  }
}
