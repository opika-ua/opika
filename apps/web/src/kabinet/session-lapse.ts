import { KABINET_SESSION_LIMITS } from "@opika/db/repos";

/** The two timestamps a session's limits are measured from. */
export type SessionTimes = { createdAt: Date; updatedAt: Date };

/** Whose limits apply: the operator's (an active super_admin grant) or everyone else's. */
export type SessionHolder = "operator" | "shelter_side";

/**
 * Whether a session has lost force for this holder (`KABINET_SESSION_LIMITS`,
 * F-B9 and §9 answers 3 and 6): idle past the holder's limit since its last
 * refresh (`updatedAt`), or older than the holder's cap. Strictly past, so a
 * session exactly at a limit lives, the same comparison as the clean-up's.
 */
export function sessionLapsedFor(session: SessionTimes, holder: SessionHolder, now: Date): boolean {
  const limits =
    holder === "operator" ? KABINET_SESSION_LIMITS.operator : KABINET_SESSION_LIMITS.shelterAdmin;
  return (
    now.getTime() - session.createdAt.getTime() > limits.absoluteMs ||
    now.getTime() - session.updatedAt.getTime() > limits.idleMs
  );
}

/**
 * Whether a session has lost force, asking who holds it only when the answer
 * depends on it. Past the shelter admin's limits it is dead for anyone; within
 * the operator's (shorter in both dimensions) it is live for anyone; in
 * between, it is dead exactly when its user is the operator. So a session in
 * daily use costs no role lookup at all.
 */
export async function sessionHasLapsed(
  session: SessionTimes,
  now: Date,
  isOperator: () => Promise<boolean>,
): Promise<boolean> {
  if (sessionLapsedFor(session, "shelter_side", now)) return true;
  if (!sessionLapsedFor(session, "operator", now)) return false;
  return isOperator();
}
