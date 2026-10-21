import type { EmailSendOutcome } from "@opika/contracts";
import { COPY_PENDING } from "@opika/i18n";
import {
  invitationEmail,
  magicLinkEmail,
  passwordChangedEmail,
  passwordResetEmail,
} from "./email-message";
import {
  type BlockedStatus,
  type BlockListReader,
  type EmailProvider,
  type EmailSender,
  type OutgoingEmail,
  ProviderSendError,
  unsupportedBlockList,
} from "./email-provider";
import type { MagicLinkSender } from "./magic-link-sender";
import type { PasswordMailSender } from "./password-mail";

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

/** Why a send went out unchecked, when it did: the sign-in log line names it. */
type UncheckedWhy = Extract<BlockedStatus, { kind: "unknown" }>["why"];

/** One checked send. Never throws: every way it can go wrong is an outcome. */
export async function sendChecked(
  mail: ProviderMail,
  email: OutgoingEmail,
): Promise<EmailSendOutcome> {
  return (await sendCheckedWithReason(mail, email)).outcome;
}

/**
 * `sendChecked`, plus two things only the log lines use: why the block check
 * wasn't done when the outcome is `sent` with `blockCheck: "unknown"` (so a
 * Resend send reads `provider_suppresses` in the sign-in line, not like a
 * failed lookup), and, for a failed send, the provider and HTTP status, which
 * both the sign-in and the invite line carry. The outcome the operator sees
 * stays the contract's.
 */
async function sendCheckedWithReason(
  mail: ProviderMail,
  email: OutgoingEmail,
): Promise<{
  outcome: EmailSendOutcome;
  uncheckedWhy: UncheckedWhy | null;
  providerFailure: ProviderFailure | null;
}> {
  const result = (
    outcome: EmailSendOutcome,
    uncheckedWhy: UncheckedWhy | null = null,
    providerFailure: ProviderFailure | null = null,
  ) => ({ outcome, uncheckedWhy, providerFailure });
  if (
    mail.refuseCopyPending &&
    [email.subject, email.html, email.text].some((part) => part.includes(COPY_PENDING))
  ) {
    return result({ kind: "failed", reason: "copy_pending" });
  }
  let status: BlockedStatus;
  try {
    status = await mail.blockedStatus(email.to);
  } catch {
    status = { kind: "unknown", why: "provider_error" };
  }
  if (status.kind === "blocked") return result({ kind: "blocked", reason: status.reason });
  // Unknown is sent anyway (IN-E11): a lookup failing must not stop a
  // deliverable email. But the outcome says the check wasn't done, because a
  // blocked address is accepted and dropped (IN-E7): a bare `sent` here would
  // be the guess `BlockedStatus` forbids.
  try {
    await mail.sender.send(email);
  } catch (error) {
    // The provider and HTTP status, when the provider module says them (`ProviderSendError`);
    // nothing else from the error reaches the log line.
    const failure =
      error instanceof ProviderSendError
        ? { provider: error.provider, status: error.status }
        : null;
    return result({ kind: "failed", reason: "provider_error" }, null, failure);
  }
  return status.kind === "not_blocked"
    ? result({ kind: "sent", blockCheck: "clear" })
    : result({ kind: "sent", blockCheck: "unknown" }, status.why);
}

/** Which provider refused or never answered a send, and with what HTTP status (null: no answer). */
type ProviderFailure = { provider: EmailProvider; status: number | null };

/**
 * The one line every unsent kabinet email logs (sign-in and invite share it, never a second
 * copy): the template, the address masked, the outcome's stable kind and reason code, and, when
 * the provider refused or never answered, its name and HTTP status. Never the full address, the
 * link or its token, the body, or a key (Oleksii, 2026-10-19: "Never log the full address, the
 * invite link or token, the email body, or any provider key").
 */
function sendFailureLine(
  template: "sign-in" | "invite" | "password-reset" | "password-changed",
  to: string,
  outcome: Exclude<EmailSendOutcome, { kind: "sent" }>,
  providerFailure: ProviderFailure | null,
): string {
  const provider =
    providerFailure === null
      ? ""
      : `, provider ${providerFailure.provider}, status ${providerFailure.status ?? "none"}`;
  return `[kabinet] ${template} email to ${maskAddress(to)} not sent: ${outcome.kind} (${outcome.reason})${provider}`;
}

/**
 * The production magic-link sender. Its result reaches nobody on screen (the
 * card is the same for any address, IN-E7), so a failure is logged with the
 * address masked and never the link, which is a credential.
 */
export function providerMagicLinkSender(
  mail: ProviderMail,
  options: {
    ttlMinutes: number;
    /**
     * Signs the email (`— {operator}`). Required, so the wiring can't build
     * this sender without it: production passes `ProductionSignIn.operatorName`,
     * i.e. `operatorDisplayName(env)`, the value that signs the invite.
     */
    operatorName: string;
    log: (line: string) => void;
  },
): MagicLinkSender {
  return {
    async send({ email, url }) {
      const { outcome, uncheckedWhy, providerFailure } = await sendCheckedWithReason(
        mail,
        magicLinkEmail({
          to: email,
          url,
          ttlMinutes: options.ttlMinutes,
          operatorName: options.operatorName,
        }),
      );
      if (outcome.kind !== "sent") {
        options.log(sendFailureLine("sign-in", email, outcome, providerFailure));
      } else if (outcome.blockCheck === "unknown") {
        // Sent, but unchecked: if she was blocked it was dropped, and this
        // line is the only trace. Its reason says which: a lookup that
        // failed, or a provider filtering on a list we don't read
        // (`provider_suppresses`, Resend).
        options.log(
          `[kabinet] sign-in email to ${maskAddress(email)} sent without a block-list check (${uncheckedWhy})`,
        );
      }
    },
  };
}

/**
 * Which second sentence the invite carries (Q-C, Oleksii 2026-10-19): `verified` for a shelter
 * that has passed verification (verified, or paused, PC-T10), whose changes appear at once;
 * `not_yet_verified` for every other status (pending, under review, suspended, rejected), which
 * gets the sentence saying people will see them once the shelter passes verification. The first
 * invite, sent at create, is always the second.
 */
export type InviteShelterVerification = "verified" | "not_yet_verified";

export type InvitationMessage = {
  email: string;
  shelterName: string;
  operatorName: string;
  /** The shelter's verification status when this email is sent. */
  shelterVerification: InviteShelterVerification;
  /** `/kabinet/vkhid?zaproshennia=<id>`, absolute. Not a sign-in link (IN-Q3). */
  url: string;
  validForHours: number;
};

/**
 * How an invitee hears of an invitation (IN-Q3); the outcome goes back to the
 * operator (IN-E7). The channel also answers the two things the operator's
 * side asks of it: which address the email came from (for the reminder to
 * tell the shelter personally, IN-E13), and which addresses the provider
 * won't deliver to (the registry's blocked list, Oleksii's answer 4).
 */
export interface InvitationSender {
  send(message: InvitationMessage): Promise<EmailSendOutcome>;
  /** The configured From address; null where nothing is really sent (development). */
  readonly fromAddress: string | null;
  /** The provider's block list, cached (`cachedBlockList`). */
  readonly blockList: BlockListReader;
}

export function providerInvitationSender(
  mail: ProviderMail,
  channel: {
    fromAddress: string;
    blockList: BlockListReader;
    /**
     * Where an unsent invite's masked line goes (Oleksii, 2026-10-19: "any send attempt
     * through Brevo should fail loudly in logs"). Required, like the sign-in sender's, so the
     * wiring can't drop it; production uses `console.warn`.
     */
    log: (line: string) => void;
  },
): InvitationSender {
  return {
    fromAddress: channel.fromAddress,
    blockList: channel.blockList,
    async send(message) {
      const { outcome, providerFailure } = await sendCheckedWithReason(
        mail,
        invitationEmail({
          to: message.email,
          url: message.url,
          shelterName: message.shelterName,
          operatorName: message.operatorName,
          shelterVerification: message.shelterVerification,
          ttlHours: message.validForHours,
        }),
      );
      // The operator also sees the outcome on screen (IN-E7); the log is what remains after.
      if (outcome.kind !== "sent") {
        channel.log(sendFailureLine("invite", message.email, outcome, providerFailure));
      }
      return outcome;
    },
  };
}

/**
 * Development: prints the invitation link, as `consoleSender` prints the magic
 * link. Since PW-2 the link is a credential (it sets the invitee's password,
 * once), so this channel is development's only, like the magic link's: never
 * production, and the harness reads it without printing it. No block list is
 * read, so the check is `unknown`, never a claimed `clear`.
 */
export const consoleInvitationSender: InvitationSender = {
  fromAddress: null,
  blockList: unsupportedBlockList,
  async send({ email, url }) {
    console.info(`[kabinet] invitation for ${email}: ${url}`);
    return { kind: "sent", blockCheck: "unknown" };
  },
};

/** Tests: records each message and answers with the outcome given. */
export function capturingInvitationSender(
  outcome: EmailSendOutcome = { kind: "sent", blockCheck: "clear" },
  channel: { fromAddress?: string | null; blockList?: BlockListReader } = {},
): InvitationSender & {
  readonly sent: InvitationMessage[];
} {
  const sent: InvitationMessage[] = [];
  return {
    sent,
    fromAddress:
      channel.fromAddress === undefined ? "noreply@mail.example.org" : channel.fromAddress,
    blockList: channel.blockList ?? unsupportedBlockList,
    async send(message) {
      sent.push(message);
      return outcome;
    },
  };
}

/**
 * The production password emails (PW-1, §4.4), on the same rule as the
 * magic link: checked before sending, and, since nobody is shown the result
 * (they go out after the response), a failure is one masked log line, never
 * the link, which is a credential. `contact` is the Reply-To address the
 * notice names («напишіть мені: {contact}»).
 */
export function providerPasswordMail(
  mail: ProviderMail,
  options: {
    ttlMinutes: number;
    operatorName: string;
    contact: string;
    log: (line: string) => void;
  },
): PasswordMailSender {
  const send = async (
    template: "password-reset" | "password-changed",
    to: string,
    email: OutgoingEmail,
  ) => {
    const { outcome, providerFailure } = await sendCheckedWithReason(mail, email);
    if (outcome.kind !== "sent")
      options.log(sendFailureLine(template, to, outcome, providerFailure));
  };
  return {
    async sendReset({ email, url }) {
      await send(
        "password-reset",
        email,
        passwordResetEmail({
          to: email,
          url,
          ttlMinutes: options.ttlMinutes,
          operatorName: options.operatorName,
        }),
      );
    },
    async sendChanged({ email }) {
      await send(
        "password-changed",
        email,
        passwordChangedEmail({
          to: email,
          contact: options.contact,
          operatorName: options.operatorName,
        }),
      );
    },
  };
}
