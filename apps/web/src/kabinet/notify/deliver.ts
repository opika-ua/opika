import type { Database } from "@opika/db";
import { type NotificationRecipient, notificationSendsRepo } from "@opika/db/repos";
import { ProviderSendError } from "../email-provider";
import { maskAddress, type ProviderMail, sendChecked } from "../email-senders";
import { type ComposeContext, composeNotification } from "./compose";
import { kyivDayStartOf } from "./day";
import { dedupKeyOf } from "./dedup";
import { BATCH_KINDS, EVENT_KINDS, type NotificationIntent } from "./intents";

/** Resend answers 2 requests a second per team; a mail every 500 ms stays under it. */
export const SEND_SPACING_MS = 500;

/** Everything a send needs from outside; the clock and the sleep are parameters so tests need neither. */
export type NotifyDeps = {
  db: Database;
  mail: ProviderMail;
  context: ComposeContext;
  now: () => Date;
  /** Event mails one Kyiv day may send in all (`NOTIFICATION_DAILY_EVENT_CAP`). */
  eventCap: number;
  sleep: (ms: number) => Promise<void>;
  log: (line: string) => void;
};

/**
 * The day's room for event mails: the cap less the sends already counted since Kyiv midnight,
 * read afresh at every `take`, which is asked before each claim. Re-reading (not counting down a
 * number read once) is what keeps two runs at the same moment honest: each sees the other's
 * claims. What stays is the one mail each run can have in flight between its read and its
 * claim, so concurrent runs can overshoot the cap by at most one mail per run.
 */
export function openEventCap(deps: Pick<NotifyDeps, "db" | "now" | "eventCap">) {
  const cap = {
    skipped: 0,
    async take(): Promise<boolean> {
      const used = await notificationSendsRepo(deps.db).countSendsSince(
        kyivDayStartOf(deps.now()),
        EVENT_KINDS,
      );
      if (deps.eventCap - used > 0) return true;
      cap.skipped += 1;
      return false;
    },
  };
  return cap;
}

export type EventCap = ReturnType<typeof openEventCap>;

/**
 * What is left of the day's one budget for the two scheduled batches (the daily and the weekly
 * cron together, so a Monday cannot send more than the budget): the budget less what they and the
 * retry sweep already sent since Kyiv midnight, read afresh before each claim (like the cap, so a
 * Monday's two crons running at once see each other; at most one in-flight mail per run of
 * overshoot). A mail past it is not claimed, so it stays due for a later run.
 */
export async function remainingBatchBudget(
  deps: Pick<NotifyDeps, "db" | "now">,
  budget: number,
): Promise<number> {
  const used = await notificationSendsRepo(deps.db).countBatchSendsSince(
    kyivDayStartOf(deps.now()),
    BATCH_KINDS,
  );
  return Math.max(0, budget - used);
}

/** Keeps successive sends at least `SEND_SPACING_MS` apart within one run. */
export function createPacer(deps: Pick<NotifyDeps, "now" | "sleep">) {
  let last: number | null = null;
  return {
    async turn(): Promise<void> {
      if (last !== null) {
        const wait = last + SEND_SPACING_MS - deps.now().getTime();
        if (wait > 0) await deps.sleep(wait);
      }
      last = deps.now().getTime();
    },
  };
}

export type Pacer = ReturnType<typeof createPacer>;

export type DeliverResult = "sent" | "failed" | "duplicate";

/**
 * Sends one claimed mail and records the outcome. A mail that cannot be composed (a catalogue
 * label that looks like a URL) is failed here, never sent.
 */
export async function sendClaimed(
  deps: NotifyDeps,
  pacer: Pacer,
  intent: NotificationIntent,
  recipient: NotificationRecipient,
  dedupKey: string,
): Promise<"sent" | "failed"> {
  let status: "sent" | "failed" = "failed";
  // A send that got no answer (timeout, network) may still have been delivered.
  let unanswered = false;
  const mail: ProviderMail = {
    ...deps.mail,
    sender: {
      async send(email) {
        try {
          return await deps.mail.sender.send(email);
        } catch (error) {
          if (error instanceof ProviderSendError && error.status === null) unanswered = true;
          throw error;
        }
      },
    },
  };
  try {
    const email = composeNotification(intent, recipient.email, deps.context);
    await pacer.turn();
    const outcome = await sendChecked(mail, email);
    if (outcome.kind === "sent") {
      status = "sent";
    } else {
      deps.log(
        `[kabinet] notification ${intent.kind} to ${maskAddress(recipient.email)} not sent: ${outcome.kind} (${outcome.reason})`,
      );
    }
  } catch {
    deps.log(
      `[kabinet] notification ${intent.kind} to ${maskAddress(recipient.email)} not sent: failed (compose_error)`,
    );
  }
  const sends = notificationSendsRepo(deps.db);
  // Closed, not retryable, when nothing answered: a second send could double a mail that did
  // arrive. One statement, so no sweep can reclaim the row in between.
  if (unanswered) await sends.closeFailed(deps.now(), dedupKey);
  else await sends.mark(deps.now(), dedupKey, status);
  return status;
}

/**
 * Claim, then send: only the caller whose insert wins sends, so a second run for the same
 * history line or period, or a cron delivered twice, mails nobody twice.
 */
export async function deliver(
  deps: NotifyDeps,
  pacer: Pacer,
  intent: NotificationIntent,
  recipient: NotificationRecipient,
): Promise<DeliverResult> {
  const dedupKey = dedupKeyOf(intent.dedupBase, recipient.userId);
  const won = await notificationSendsRepo(deps.db).claim(deps.now(), {
    dedupKey,
    kind: intent.kind,
    shelterId: intent.shelterId,
    recipientUserId: recipient.userId,
  });
  if (!won) return "duplicate";
  return sendClaimed(deps, pacer, intent, recipient, dedupKey);
}
