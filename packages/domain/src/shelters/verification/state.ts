import { z } from "zod";
import { ModeratorIdSchema } from "../../primitives/ids.js";
import { VerificationEvidenceSchema } from "./evidence.js";
import { RejectionReasonSchema, SuspensionReasonSchema } from "./reasons.js";

/**
 * Evidence is carried on every state, not only on `verified`.
 *
 * It is submitted at `pending` and is the thing a reviewer looks at, so
 * dropping it on `under_review` would send the reviewer elsewhere for the one
 * record they need, and dropping it on `rejected` would leave a resubmission
 * with nothing to diff against.
 *
 * `priorStatus` on `suspended` is pinned to the literal "verified" because only
 * a live shelter can be suspended. If suspension is ever opened from another
 * state, widening this literal makes the compiler point at every site that
 * assumed otherwise — which is the entire reason it is a field and not a
 * comment.
 */
export const ShelterVerificationSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("pending"),
    submittedAt: z.date(),
    evidence: VerificationEvidenceSchema,
  }),
  z.object({
    status: z.literal("under_review"),
    startedAt: z.date(),
    reviewerId: ModeratorIdSchema,
    evidence: VerificationEvidenceSchema,
  }),
  z.object({
    status: z.literal("verified"),
    verifiedAt: z.date(),
    verifiedBy: ModeratorIdSchema,
    evidence: VerificationEvidenceSchema,
  }),
  z.object({
    status: z.literal("rejected"),
    rejectedAt: z.date(),
    rejectedBy: ModeratorIdSchema,
    reason: RejectionReasonSchema,
    evidence: VerificationEvidenceSchema,
  }),
  z.object({
    status: z.literal("suspended"),
    suspendedAt: z.date(),
    suspendedBy: ModeratorIdSchema,
    reason: SuspensionReasonSchema,
    priorStatus: z.literal("verified"),
    evidence: VerificationEvidenceSchema,
  }),
]);
export type ShelterVerification = z.infer<typeof ShelterVerificationSchema>;
export type VerificationStatus = ShelterVerification["status"];

export const VERIFICATION_STATUSES = [
  "pending",
  "under_review",
  "verified",
  "rejected",
  "suspended",
] as const satisfies readonly VerificationStatus[];

/** The instant the current state was entered. Used to reject out-of-order events. */
export const enteredAt = (state: ShelterVerification): Date => {
  switch (state.status) {
    case "pending":
      return state.submittedAt;
    case "under_review":
      return state.startedAt;
    case "verified":
      return state.verifiedAt;
    case "rejected":
      return state.rejectedAt;
    case "suspended":
      return state.suspendedAt;
    default: {
      const unreachable: never = state;
      return unreachable;
    }
  }
};

/**
 * The only distinction an adopter is entitled to. Moderator identities,
 * evidence and reasons are internal, so the public projection is derived here
 * rather than assembled ad hoc at each call site.
 */
export const FEED_VISIBLE_VERIFICATION_STATUSES = [
  "verified",
] as const satisfies readonly VerificationStatus[];

export const isPubliclyVerified = (state: ShelterVerification): boolean =>
  (FEED_VISIBLE_VERIFICATION_STATUSES as readonly string[]).includes(state.status);
