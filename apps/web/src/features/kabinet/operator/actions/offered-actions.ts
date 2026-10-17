import {
  DEFAULT_VERIFICATION_POLICY,
  type EvidenceGap,
  evidenceGaps,
  type InterruptedState,
  type ShelterLegalEntity,
  type ShelterVerification,
  type VerificationEventType,
  type VerificationPolicy,
} from "@opika/domain";

/**
 * The verification events the operator sends from S4: the six the registry
 * contract serves (`registry.verification.*`). `pause` and `resume` are
 * domain events too, but they are the shelter's own (N21) and the registry
 * has no procedure for them, so S4 never offers them. A test holds this list
 * against the contract's procedures, so a seventh registry move can't ship
 * without a decision about its button.
 */
export const OPERATOR_VERIFICATION_EVENTS = [
  "start_review",
  "approve",
  "reject",
  "suspend",
  "reinstate",
  "resubmit",
] as const satisfies readonly VerificationEventType[];
export type OperatorVerificationEvent = (typeof OPERATOR_VERIFICATION_EVENTS)[number];

/**
 * Whether «Схвалити» can be pressed. Decided by the domain's own
 * `evidenceGaps`, the same check the server runs before it approves
 * (`registryApprove`), so the button never offers what the API refuses and
 * the operator is told which evidence to chase instead of being told "no".
 * A non-empty tuple: a blocked gate always has a gap to show.
 */
export type ApproveGate =
  | { kind: "open" }
  | { kind: "blocked"; gaps: readonly [EvidenceGap, ...EvidenceGap[]] };

/**
 * One move S4 offers, with what its control needs to say about it. `reinstate`
 * carries the state the suspension interrupted, so the button names where it
 * returns («Відновити → «На паузі»») before it is pressed.
 */
export type OfferedAction =
  | { event: "start_review" }
  | { event: "approve"; gate: ApproveGate }
  | { event: "reject" }
  | { event: "suspend" }
  | { event: "reinstate"; to: InterruptedState }
  | { event: "resubmit" };

const approveGateOf = (
  legalEntity: ShelterLegalEntity,
  verification: ShelterVerification,
  policy: VerificationPolicy,
): ApproveGate => {
  const [first, ...rest] = evidenceGaps(legalEntity, verification.evidence, policy);
  return first === undefined ? { kind: "open" } : { kind: "blocked", gaps: [first, ...rest] };
};

/**
 * The moves S4 offers from the shelter's current status: exactly the operator
 * events the domain's `transition()` accepts from it, written out by hand so
 * `offered-actions.test.ts` can hold the two against each other (FSM parity).
 * An edge opened or closed on either side fails that test.
 *
 * `pending` offers «Відхилити…» as well as «Взяти на розгляд»: the domain
 * keeps `pending → rejected` open on purpose (CLAUDE.md decision #5: refusing
 * obvious spam needs no formal review first). There is no approve from
 * `pending`, in the domain and here alike: approval is always a second step
 * after «Взяти на розгляд» (RU-Q4, answer 4).
 */
export function offeredActionsOf(
  verification: ShelterVerification,
  legalEntity: ShelterLegalEntity,
  policy: VerificationPolicy = DEFAULT_VERIFICATION_POLICY,
): readonly OfferedAction[] {
  switch (verification.status) {
    case "pending":
      return [{ event: "start_review" }, { event: "reject" }];
    case "under_review":
      return [
        { event: "approve", gate: approveGateOf(legalEntity, verification, policy) },
        { event: "reject" },
      ];
    case "verified":
    case "paused":
      return [{ event: "suspend" }];
    case "rejected":
      return [{ event: "resubmit" }];
    case "suspended":
      return [{ event: "reinstate", to: verification.priorState }, { event: "reject" }];
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled status; unreachable at runtime */
    default: {
      const unreachable: never = verification;
      return unreachable;
    }
  }
}
