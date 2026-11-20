import { kyivCalendarDateOf } from "@opika/domain";
import { OPERATOR_CONTACT } from "../../brand";
import { type RegistrationEmailDeps, sendTransactionalEmail } from "../registration-email";

/** Share of the event cap at which the operator is told (owner, 2026-11-20). */
export const NEAR_CAP_PERCENT = 80;

/** The tally at which the mail that reaches it raises the alarm; integer maths, so 300 gives 240. */
export const nearCapAt = (cap: number): number => Math.ceil((cap * NEAR_CAP_PERCENT) / 100);

/** Once per Kyiv day, the day the event cap counts: `notification_sends` claims it atomically. */
export const nearCapDedupKey = (now: Date): string =>
  `notification_cap_warning:${kyivCalendarDateOf(now)}`;

/**
 * The operator's warning: how far the day's notification mails have come, nothing about any
 * recipient. Never throws: it runs inside a send loop and a failed warning must change nothing.
 */
export async function sendNearCapAlarm(deps: RegistrationEmailDeps, cap: number): Promise<void> {
  try {
    await sendTransactionalEmail(
      deps,
      { template: "notification_cap_warning", count: nearCapAt(cap), cap },
      OPERATOR_CONTACT.email,
      nearCapDedupKey(deps.now()),
      { shelterId: null, recipientUserId: null },
    );
  } catch {
    deps.log("[kabinet] notification cap warning not sent");
  }
}
