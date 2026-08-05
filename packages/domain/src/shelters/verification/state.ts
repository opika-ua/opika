import { z } from "zod";
import { ModeratorIdSchema } from "../../primitives/ids.js";
import { VerificationEvidenceSchema } from "./evidence.js";
import { PauseReasonSchema, RejectionReasonSchema, SuspensionReasonSchema } from "./reasons.js";

/**
 * The approval a shelter earned, carried forward by every state that follows it.
 *
 * A paused or suspended shelter is still a shelter somebody verified on a
 * particular day. Keeping those two facts on the state means resuming or
 * reinstating restores the original approval rather than minting a new one that
 * credits whoever happened to lift the interruption.
 */
const verifiedFacts = {
  verifiedAt: z.date(),
  verifiedBy: ModeratorIdSchema,
};

const pausedFacts = {
  pausedAt: z.date(),
  pausedBy: ModeratorIdSchema,
  reason: PauseReasonSchema,
};

/**
 * The state a suspension interrupted, carried whole rather than as a status
 * literal.
 *
 * A bare `priorStatus: "verified" | "paused"` cannot restore a pause: the
 * reason and the pausing moderator would be gone, so reinstating a shelter that
 * was suspended mid-pause would have to invent them or silently reactivate a
 * shelter that had asked to be closed. Carrying the interrupted state makes
 * reinstatement exact.
 */
export const InterruptedStateSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("verified"), ...verifiedFacts }),
  z.object({ status: z.literal("paused"), ...verifiedFacts, ...pausedFacts }),
]);
export type InterruptedState = z.infer<typeof InterruptedStateSchema>;

/**
 * Evidence is carried on every state, not only on `verified`.
 *
 * It is submitted at `pending` and is the thing a reviewer looks at, so
 * dropping it on `under_review` would send the reviewer elsewhere for the one
 * record they need, and dropping it on `rejected` would leave a resubmission
 * with nothing to diff against.
 *
 * `paused` and `suspended` are deliberately distinct rather than one state with
 * a reason code. A pause is self-declared and a suspension is imposed, and —
 * decisively — they differ in who may end them: a shelter may resume itself
 * once it has a login, whereas lifting a suspension is always a moderator's
 * call. A reason code cannot carry a permission, so encoding the difference in
 * one would push that rule out to every call site.
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
    ...verifiedFacts,
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
    status: z.literal("paused"),
    ...verifiedFacts,
    ...pausedFacts,
    evidence: VerificationEvidenceSchema,
  }),
  z.object({
    status: z.literal("suspended"),
    suspendedAt: z.date(),
    suspendedBy: ModeratorIdSchema,
    reason: SuspensionReasonSchema,
    priorState: InterruptedStateSchema,
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
  "paused",
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
    case "paused":
      return state.pausedAt;
    case "suspended":
      return state.suspendedAt;
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled variant; unreachable at runtime */
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
 *
 * A paused shelter is excluded. It remains verified in the trust sense — the
 * approval is still on the state — but it is not currently taking adopters, and
 * showing its animals would send people to a closed door.
 */
export const FEED_VISIBLE_VERIFICATION_STATUSES = [
  "verified",
] as const satisfies readonly VerificationStatus[];

export const isPubliclyVerified = (state: ShelterVerification): boolean =>
  (FEED_VISIBLE_VERIFICATION_STATUSES as readonly string[]).includes(state.status);

/**
 * Whether a shelter has ever been approved, regardless of whether it is
 * currently listed. Distinct from feed visibility: a paused shelter should not
 * be asked to re-submit evidence just because it closed for the winter.
 */
export const hasBeenVerified = (state: ShelterVerification): boolean =>
  state.status === "verified" || state.status === "paused" || state.status === "suspended";
