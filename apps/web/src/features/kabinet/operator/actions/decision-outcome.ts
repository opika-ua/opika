/**
 * The decision panel's runner key: the reason dialog and resubmit send their
 * requests as the panel's, so the panel is the one that says what happened.
 */
export const DECISION_OWNER = "decision";

/**
 * How a verification move ended, as the decision panel reports it: done (the
 * new status is the message, and the panel's own controls change with it),
 * refused because the status had moved (said once the page has been re-read),
 * or failed.
 */
export type DecisionOutcome =
  | { kind: "moved" }
  | { kind: "illegal_transition" }
  | { kind: "failed" };
