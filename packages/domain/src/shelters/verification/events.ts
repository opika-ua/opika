import { z } from "zod";
import { ModeratorIdSchema } from "../../primitives/ids.js";
import { VerificationEvidenceSchema } from "./evidence.js";
import { PauseReasonSchema, RejectionReasonSchema, SuspensionReasonSchema } from "./reasons.js";

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
  z.object({
    type: z.literal("resubmit"),
    at: z.date(),
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
   * `pause` and `resume` carry a ModeratorId today because shelters have no
   * login at MVP, so an admin acts on their behalf. That is the half-measure,
   * not the design: keeping them as distinct events from suspend/reinstate is
   * what makes the partner dashboard a change to who may send `resume` rather
   * than a change to the lifecycle itself.
   */
  z.object({
    type: z.literal("pause"),
    at: z.date(),
    moderatorId: ModeratorIdSchema,
    reason: PauseReasonSchema,
  }),
  z.object({
    type: z.literal("resume"),
    at: z.date(),
    moderatorId: ModeratorIdSchema,
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
