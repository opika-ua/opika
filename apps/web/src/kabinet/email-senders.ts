import type { EmailSendOutcome } from "@opika/contracts";
import { COPY_PENDING } from "@opika/i18n";
import { invitationEmail, magicLinkEmail } from "./email-message";
import type { BlockedStatus, EmailSender, OutgoingEmail } from "./email-provider";
import type { MagicLinkSender } from "./magic-link-sender";

/**
 * The provider-backed senders for the two kabinet emails, and the rule both
 * follow (IN-E7, Oleksii, 2026-10-14):
 *
 * - Ask the provider whether the address is blocked **before** sending. A
 *   recipient who taps Gmail's "Unsubscribe" on a sign-in email lands on
 *   Brevo's block list, and Brevo accepts a later send to that address and
 *   drops it (inferred, IN-E7): the send's own answer can't say so.
 * - Operator-triggered invitations report the outcome to the operator.
 * - Sign-in emails run after the response (`after()`), behind a card that is
 *   the same for every address, so a failure is a log line with the address
 *   masked, never a different screen. Notifying the operator needs a
 *   mechanism that doesn't exist yet (IN-E9).
 *
 * Unblocking in Brevo stays manual (IN-E7).
 */

/** What the provider-backed senders need: the provider module's sender, its block-list lookup, and the production copy rule. */
export type ProviderMail = {
  sender: EmailSender;
  blockedStatus: (address: string) => Promise<BlockedStatus>;
  /** IN-Q5: in production an email still holding `[COPY PENDING]` text is refused, never sent. */
  refuseCopyPending: boolean;
};

/** `o•••@gmail.com`: enough for the operator to recognise, not enough to copy. */
export function maskAddress(address: string): string {
  const at = address.lastIndexOf("@");
  if (at <= 0) return "•••";
  return `${address[0]}•••${address.slice(at)}`;
}

/** One checked send. Never throws: every way it can go wrong is an outcome. */
export async function sendChecked(
  mail: ProviderMail,
  email: OutgoingEmail,
): Promise<EmailSendOutcome> {
  if (
    mail.refuseCopyPending &&
    [email.subject, email.html, email.text].some((part) => part.includes(COPY_PENDING))
  ) {
    return { kind: "failed", reason: "copy_pending" };
  }
  let status: BlockedStatus;
  try {
    status = await mail.blockedStatus(email.to);
  } catch {
    status = { kind: "unknown", why: "provider_error" };
  }
  if (status.kind === "blocked") return { kind: "blocked", reason: status.reason };
  // Unknown is sent anyway (IN-E11): a lookup failing must not stop a
  // deliverable email. But the outcome says the check wasn't done, because a
  // blocked address is accepted and dropped (IN-E7): a bare `sent` here would
  // be the guess `BlockedStatus` forbids.
  const blockCheck = status.kind === "not_blocked" ? "clear" : "unknown";
  try {
    await mail.sender.send(email);
    return { kind: "sent", blockCheck };
  } catch {
    return { kind: "failed", reason: "provider_error" };
  }
}

const describeOutcome = (outcome: Exclude<EmailSendOutcome, { kind: "sent" }>) =>
  `${outcome.kind} (${outcome.reason})`;

/**
 * The production magic-link sender. Its result reaches nobody on screen (the
 * card is the same for any address, IN-E7), so a failure is logged with the
 * address masked and never the link, which is a credential.
 */
export function providerMagicLinkSender(
  mail: ProviderMail,
  options: { ttlMinutes: number; log: (line: string) => void },
): MagicLinkSender {
  return {
    async send({ email, url }) {
      const outcome = await sendChecked(
        mail,
        magicLinkEmail({ to: email, url, ttlMinutes: options.ttlMinutes }),
      );
      if (outcome.kind !== "sent") {
        options.log(
          `[kabinet] sign-in email to ${maskAddress(email)} not sent: ${describeOutcome(outcome)}`,
        );
      } else if (outcome.blockCheck === "unknown") {
        // Sent, but unchecked: if she was blocked it was dropped, and this line is the only trace.
        options.log(
          `[kabinet] sign-in email to ${maskAddress(email)} sent without a block-list check`,
        );
      }
    },
  };
}

export type InvitationMessage = {
  email: string;
  shelterName: string;
  operatorName: string;
  /** `/kabinet/vkhid?zaproshennia=<id>`, absolute. Not a sign-in link (IN-Q3). */
  url: string;
  validForHours: number;
};

/** How an invitee hears of an invitation (IN-Q3); the outcome goes back to the operator (IN-E7). */
export interface InvitationSender {
  send(message: InvitationMessage): Promise<EmailSendOutcome>;
}

export function providerInvitationSender(mail: ProviderMail): InvitationSender {
  return {
    send: (message) =>
      sendChecked(
        mail,
        invitationEmail({
          to: message.email,
          url: message.url,
          shelterName: message.shelterName,
          operatorName: message.operatorName,
          ttlHours: message.validForHours,
        }),
      ),
  };
}

/**
 * Development: prints the invite landing's link. It isn't a credential (the
 * landing sends its own magic link). No block list is read, so the check is
 * `unknown`, never a claimed `clear`.
 */
export const consoleInvitationSender: InvitationSender = {
  async send({ email, url }) {
    console.info(`[kabinet] invitation for ${email}: ${url}`);
    return { kind: "sent", blockCheck: "unknown" };
  },
};

/** Tests: records each message and answers with the outcome given. */
export function capturingInvitationSender(
  outcome: EmailSendOutcome = { kind: "sent", blockCheck: "clear" },
): InvitationSender & {
  readonly sent: InvitationMessage[];
} {
  const sent: InvitationMessage[] = [];
  return {
    sent,
    async send(message) {
      sent.push(message);
      return outcome;
    },
  };
}
