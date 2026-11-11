import type { Database } from "@opika/db";
import { type NotificationRecipient, notificationSendsRepo } from "@opika/db/repos";
import { maskAddress, type ProviderMail, sendChecked } from "../email-senders";
import { type ComposeContext, composeNotification } from "./compose";
import { dedupKeyOf } from "./dedup";
import type { NotificationIntent } from "./intents";

/** Resend answers 2 requests a second per team; a mail every 500 ms stays under it. */
export const SEND_SPACING_MS = 500;

/** Everything a send needs from outside; the clock and the sleep are parameters so tests need neither. */
export type NotifyDeps = {
  db: Database;
  mail: ProviderMail;
  context: ComposeContext;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
  log: (line: string) => void;
};

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
  try {
    const email = composeNotification(intent, recipient.email, deps.context);
    await pacer.turn();
    const outcome = await sendChecked(deps.mail, email);
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
  await notificationSendsRepo(deps.db).mark(deps.now(), dedupKey, status);
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
