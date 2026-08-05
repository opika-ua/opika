import type { VerificationEvent, VerificationEventType } from "./events.js";
import type { VerificationEvidence } from "./evidence.js";
import { enteredAt, type ShelterVerification, type VerificationStatus } from "./state.js";

/**
 * A result union rather than a thrown error, so the function stays total and
 * pure and every caller is forced to handle refusal.
 */
export type TransitionResult =
  | { kind: "ok"; next: ShelterVerification }
  | { kind: "illegal"; from: VerificationStatus; event: VerificationEventType }
  | {
      kind: "non_monotonic";
      from: VerificationStatus;
      stateTimestamp: Date;
      eventTimestamp: Date;
    };

/** Entry point into the machine. There is no prior state, so this is not an event. */
export const submitForVerification = (
  evidence: VerificationEvidence,
  at: Date,
): ShelterVerification => ({
  status: "pending",
  submittedAt: at,
  evidence,
});

/**
 * The transition table, as code. Returns null for every pair the lifecycle does
 * not permit.
 *
 * Two edges are open that a narrower reading would close:
 *
 * `pending -> rejected` — a rejection is always made by a moderator who looked
 * at the submission, and the event carries their id either way. Requiring a
 * formal `start_review` first on obvious spam models a click, not a lifecycle.
 *
 * `suspended -> rejected` — without it, `suspended` means both "paused, may
 * return" and "banned, never returning", which is one state carrying two
 * meanings.
 *
 * `verified <-> paused` is the non-punitive exit. Suspension used to be the
 * only way out of `verified`, so a shelter closing for the season or moving
 * premises was recorded as suspended with a moderation reason — punitive in the
 * admin UI, and conflating "we stopped them" with "they stopped themselves".
 *
 * `paused -> suspended` is open because a complaint does not wait for a shelter
 * to reopen, and `reinstate` restores whatever was interrupted rather than
 * always landing on `verified`.
 *
 * Three edges stay closed on purpose:
 *
 * `under_review -> suspended` — suspension is something that happens to a live
 * shelter, and a shelter under review is not in the feed. If a complaint
 * arrives mid-review, rejection is the available action.
 *
 * `verified -> under_review` — a verified shelter moved back to review would
 * silently vanish from the feed with no record that it had ever been verified,
 * which is the exact failure `priorState` was added to prevent. Periodic
 * re-verification belongs in a future `re_review` state that carries its prior
 * state, not in an overload of the first-time review state.
 *
 * `paused -> rejected` — banning a shelter that was already accepted is an
 * escalation, and the audit trail should show the suspension that preceded it.
 * This is a deliberate asymmetry with `pending -> rejected`, which is open:
 * refusing an applicant needs no prior state, removing an accepted shelter
 * does.
 */
const nextState = (
  current: ShelterVerification,
  event: VerificationEvent,
): ShelterVerification | null => {
  switch (current.status) {
    case "pending":
      switch (event.type) {
        case "start_review":
          return {
            status: "under_review",
            startedAt: event.at,
            reviewerId: event.reviewerId,
            evidence: current.evidence,
          };
        case "reject":
          return {
            status: "rejected",
            rejectedAt: event.at,
            rejectedBy: event.moderatorId,
            reason: event.reason,
            evidence: current.evidence,
          };
        default:
          return null;
      }

    case "under_review":
      switch (event.type) {
        case "approve":
          return {
            status: "verified",
            verifiedAt: event.at,
            verifiedBy: event.moderatorId,
            evidence: current.evidence,
          };
        case "reject":
          return {
            status: "rejected",
            rejectedAt: event.at,
            rejectedBy: event.moderatorId,
            reason: event.reason,
            evidence: current.evidence,
          };
        default:
          return null;
      }

    case "verified":
      switch (event.type) {
        case "suspend":
          return {
            status: "suspended",
            suspendedAt: event.at,
            suspendedBy: event.moderatorId,
            reason: event.reason,
            priorState: {
              status: "verified",
              verifiedAt: current.verifiedAt,
              verifiedBy: current.verifiedBy,
            },
            evidence: current.evidence,
          };
        case "pause":
          return {
            status: "paused",
            // The original approval travels with the pause, so resuming credits
            // whoever verified the shelter rather than whoever reopened it.
            verifiedAt: current.verifiedAt,
            verifiedBy: current.verifiedBy,
            pausedAt: event.at,
            pausedBy: event.moderatorId,
            reason: event.reason,
            evidence: current.evidence,
          };
        default:
          return null;
      }

    case "paused":
      switch (event.type) {
        case "resume":
          return {
            status: "verified",
            verifiedAt: current.verifiedAt,
            verifiedBy: current.verifiedBy,
            evidence: current.evidence,
          };
        case "suspend":
          // A complaint does not wait for a shelter to reopen. The whole paused
          // state is captured so reinstatement can put it back exactly.
          return {
            status: "suspended",
            suspendedAt: event.at,
            suspendedBy: event.moderatorId,
            reason: event.reason,
            priorState: {
              status: "paused",
              verifiedAt: current.verifiedAt,
              verifiedBy: current.verifiedBy,
              pausedAt: current.pausedAt,
              pausedBy: current.pausedBy,
              reason: current.reason,
            },
            evidence: current.evidence,
          };
        default:
          return null;
      }

    case "rejected":
      switch (event.type) {
        case "resubmit":
          return {
            status: "pending",
            submittedAt: event.at,
            evidence: event.evidence,
          };
        default:
          return null;
      }

    case "suspended":
      switch (event.type) {
        case "reinstate":
          // Restores the interrupted state exactly, rather than always landing
          // on `verified`. Lifting a suspension from a shelter that had asked
          // to be closed must not quietly reopen it.
          return current.priorState.status === "paused"
            ? {
                status: "paused",
                verifiedAt: current.priorState.verifiedAt,
                verifiedBy: current.priorState.verifiedBy,
                pausedAt: current.priorState.pausedAt,
                pausedBy: current.priorState.pausedBy,
                reason: current.priorState.reason,
                evidence: current.evidence,
              }
            : {
                status: "verified",
                verifiedAt: current.priorState.verifiedAt,
                verifiedBy: current.priorState.verifiedBy,
                evidence: current.evidence,
              };
        case "reject":
          return {
            status: "rejected",
            rejectedAt: event.at,
            rejectedBy: event.moderatorId,
            reason: event.reason,
            evidence: current.evidence,
          };
        default:
          return null;
      }

    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled variant; unreachable at runtime */
    default: {
      const unreachable: never = current;
      return unreachable;
    }
  }
};

/**
 * Legality is checked before ordering: an event the lifecycle forbids is
 * forbidden whatever its timestamp says, and reporting a clock problem for a
 * transition that could never apply would send a reader down the wrong path.
 *
 * The ordering check itself exists because a verification history is an audit
 * trail, and an out-of-order write corrupts it silently rather than loudly.
 */
export const transition = (
  current: ShelterVerification,
  event: VerificationEvent,
): TransitionResult => {
  const next = nextState(current, event);
  if (next === null) {
    return { kind: "illegal", from: current.status, event: event.type };
  }

  const stateTimestamp = enteredAt(current);
  if (event.at.getTime() < stateTimestamp.getTime()) {
    return {
      kind: "non_monotonic",
      from: current.status,
      stateTimestamp,
      eventTimestamp: event.at,
    };
  }

  return { kind: "ok", next };
};
