import { z } from "zod";
import { ModeratorIdSchema } from "../../primitives/ids";
import { ShelterActorSchema } from "../actor";
import { VerificationEvidenceSchema } from "./evidence";
import { PauseReasonSchema, RejectionReasonSchema, SuspensionReasonSchema } from "./reasons";

/**
 * Initial submission is deliberately absent from this union. There is no prior
 * state for it to transition from, so it is a constructor
 * (`submitForVerification`) rather than an event; modelling it here would add a
 * row of always-illegal cells to the transition table for no information gain.
 * Re-entry after a rejection is covered by `resubmit`.
 */
export const VerificationEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("start_review"),
    at: z.date(),
    reviewerId: ModeratorIdSchema,
  }),
  z.object({
    type: z.literal("approve"),
    at: z.date(),
    moderatorId: ModeratorIdSchema,
  }),
  z.object({
    type: z.literal("reject"),
    at: z.date(),
    moderatorId: ModeratorIdSchema,
    reason: RejectionReasonSchema,
  }),
  /**
   * `actor` (H2-2): either the operator resubmitting with amended evidence, or
   * the shelter's own administrator asking for another look with the evidence
   * it already has. The history needs to say which; a person reviews either way.
   */
  z.object({
    type: z.literal("resubmit"),
    at: z.date(),
    actor: ShelterActorSchema,
    evidence: VerificationEvidenceSchema,
  }),
  z.object({
    type: z.literal("suspend"),
    at: z.date(),
    moderatorId: ModeratorIdSchema,
    reason: SuspensionReasonSchema,
  }),
  z.object({
    type: z.literal("reinstate"),
    at: z.date(),
    moderatorId: ModeratorIdSchema,
  }),
  /**
   * `pause` and `resume` take an actor (H2): the shelter's own administrator
   * once the kabinet exists, or the operator acting for a shelter with no
   * login. Keeping them distinct from suspend/reinstate is what made this a
   * change to *who may send* them rather than to the lifecycle itself.
   */
  z.object({
    type: z.literal("pause"),
    at: z.date(),
    actor: ShelterActorSchema,
    reason: PauseReasonSchema,
  }),
  z.object({
    type: z.literal("resume"),
    at: z.date(),
    actor: ShelterActorSchema,
  }),
]);
export type VerificationEvent = z.infer<typeof VerificationEventSchema>;
export type VerificationEventType = VerificationEvent["type"];

export const VERIFICATION_EVENT_TYPES = [
  "start_review",
  "approve",
  "reject",
  "resubmit",
  "suspend",
  "reinstate",
  "pause",
  "resume",
] as const satisfies readonly VerificationEventType[];
