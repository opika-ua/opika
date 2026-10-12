import { z } from "zod";
import { PauseReasonSchema, RejectionReasonSchema, SuspensionReasonSchema } from "./reasons";
import type { ShelterVerification } from "./state";

/**
 * What a shelter is shown of its own verification (KABINET K2, K4, K5): its
 * status, since when, and the reason when there is one. **Never** the evidence,
 * and never a moderator's id. Those are the operator's working record. K5's
 * "what the operator wrote" is the reason's note, shown verbatim, and the
 * operator's name comes from app config, not from an id (decisions §5).
 *
 * The distinguishing field is `status`, matching `ShelterVerification`.
 */
export const ShelterFacingVerificationSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("pending"), since: z.date() }),
  z.object({ status: z.literal("under_review"), since: z.date() }),
  z.object({ status: z.literal("verified"), since: z.date() }),
  z.object({ status: z.literal("paused"), since: z.date(), reason: PauseReasonSchema }),
  z.object({ status: z.literal("rejected"), at: z.date(), reason: RejectionReasonSchema }),
  z.object({ status: z.literal("suspended"), at: z.date(), reason: SuspensionReasonSchema }),
]);
export type ShelterFacingVerification = z.infer<typeof ShelterFacingVerificationSchema>;

/**
 * Built field by field, never by spreading the state and deleting: a field
 * added to `ShelterVerification` later can't reach a shelter by default, the
 * same reasoning as `pick` over `omit` for public views.
 */
export const shelterFacingVerificationOf = (
  state: ShelterVerification,
): ShelterFacingVerification => {
  switch (state.status) {
    case "pending":
      return { status: "pending", since: state.submittedAt };
    case "under_review":
      return { status: "under_review", since: state.startedAt };
    case "verified":
      return { status: "verified", since: state.verifiedAt };
    case "paused":
      return { status: "paused", since: state.pausedAt, reason: state.reason };
    case "rejected":
      return { status: "rejected", at: state.rejectedAt, reason: state.reason };
    case "suspended":
      return { status: "suspended", at: state.suspendedAt, reason: state.reason };
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled variant; unreachable at runtime */
    default: {
      const unreachable: never = state;
      return unreachable;
    }
  }
};
