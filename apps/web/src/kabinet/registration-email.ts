import type { Database } from "@opika/db";
import { notificationSendsRepo } from "@opika/db/repos";
import type { ApplicationRejectionReason, ShelterId } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import { WORDMARK } from "../brand";
import { emailBody } from "./email-message";
import { type OutgoingEmail, ProviderSendError } from "./email-provider";
import { maskAddress, type ProviderMail, sendChecked } from "./email-senders";

/**
 * Self-registration's emails (Appendix A, A4), by template id. Every one goes out at most once per
 * idempotency key: the key is claimed in `notification_sends` before the send, as the notification
 * mails do, so a retried action or a double click mails nobody twice (§11.6).
 */
export const REGISTRATION_EMAIL_TEMPLATES = [
  "application_confirm",
  "application_approved",
  "application_rejected",
  "operator_new_application",
  "registration_cap_hit",
] as const;
export type RegistrationEmailTemplate = (typeof REGISTRATION_EMAIL_TEMPLATES)[number];

export type RegistrationEmail =
  | {
      template: "application_confirm";
      name: string;
      confirmUrl: string;
      notMeUrl: string;
      operatorName: string;
    }
  | { template: "application_approved"; name: string; kabinetUrl: string }
  | {
      template: "application_rejected";
      name: string;
      reason: ApplicationRejectionReason;
      contactEmail: string;
      telegram: string;
    }
  | {
      /** Operator only, plain: what the queue card shows, so hello@ can triage from the inbox. */
      template: "operator_new_application";
      name: string;
      cityName: string;
      link: string;
      contact: string;
      email: string;
      queueUrl: string;
    }
  | {
      /** Operator only, once a day: the confirmation emails hit the cap. Nothing about anyone. */
      template: "registration_cap_hit";
      count: number;
      queueUrl: string;
    };

const SUBJECT_MAX_CHARACTERS = 200;

/** C0 and C1 controls (CR and LF among them) and the Unicode line and paragraph separators. */
const isBreaking = (char: string): boolean => {
  const code = char.codePointAt(0) ?? 0;
  return code < 0x20 || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029;
};

/**
 * Applicant text reaches subjects (the shelter's name), so line breaks and control characters are
 * removed before a provider sees them (header injection, §11.3). Bodies are escaped by `emailBody`.
 */
export function safeSubject(subject: string): string {
  const cleaned = [...subject].map((char) => (isBreaking(char) ? " " : char)).join("");
  return [...cleaned.replace(/\s+/g, " ").trim()].slice(0, SUBJECT_MAX_CHARACTERS).join("");
}

const rejectionReasonText = (reason: ApplicationRejectionReason): string => {
  const presets = uk.registration.rejectionReasons;
  return reason.code === "other"
    ? fillTemplate(presets.other, { text: reason.note ?? "" })
    : presets[reason.code];
};

export function registrationEmailOf(email: RegistrationEmail, to: string): OutgoingEmail {
  const copy = uk.kabinet.email;
  switch (email.template) {
    case "application_confirm": {
      const c = copy.applicationConfirm;
      return emailBody(to, {
        subject: safeSubject(fillTemplate(c.subject, { site: WORDMARK })),
        before: [fillTemplate(c.body, { name: email.name, site: WORDMARK })],
        link: { label: c.action, url: email.confirmUrl },
        after: [c.notYou],
        trailingLink: { label: c.notYouAction, url: email.notMeUrl },
      });
    }
    case "application_approved": {
      const c = copy.applicationApproved;
      return emailBody(to, {
        subject: safeSubject(fillTemplate(c.subject, { name: email.name })),
        before: [c.body],
        link: { label: c.action, url: email.kabinetUrl },
        after: [c.pending],
      });
    }
    case "application_rejected": {
      const c = copy.applicationRejected;
      return emailBody(to, {
        subject: safeSubject(fillTemplate(c.subject, { name: email.name })),
        before: [
          fillTemplate(c.body, { reason: rejectionReasonText(email.reason) }),
          fillTemplate(c.contact, { email: email.contactEmail, telegram: email.telegram }),
          c.retention,
        ],
        link: null,
        after: [],
      });
    }
    case "operator_new_application": {
      const c = copy.operatorNewApplication;
      return emailBody(to, {
        subject: safeSubject(fillTemplate(c.subject, { name: email.name, city: email.cityName })),
        before: [email.name, email.cityName, email.link, email.contact, email.email],
        link: { label: c.action, url: email.queueUrl },
        after: [],
      });
    }
    case "registration_cap_hit": {
      const c = copy.registrationCapHit;
      return emailBody(to, {
        subject: safeSubject(c.subject),
        before: [fillTemplate(c.body, { count: String(email.count) })],
        link: { label: copy.operatorNewApplication.action, url: email.queueUrl },
        after: [],
      });
    }
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled template; unreachable at runtime */
    default: {
      const unreachable: never = email;
      return unreachable;
    }
  }
}

export type RegistrationEmailDeps = {
  db: Database;
  mail: ProviderMail;
  now: () => Date;
  log: (line: string) => void;
};

export type TransactionalSendResult = "sent" | "failed" | "duplicate";

/**
 * Claim `idempotencyKey`, then send. Only the claim's winner sends; a send nobody answered
 * (timeout) is closed rather than retried, since it may have arrived. Logs carry the template and
 * a masked address only, never applicant text (§11.8).
 */
export async function sendTransactionalEmail(
  deps: RegistrationEmailDeps,
  email: RegistrationEmail,
  to: string,
  idempotencyKey: string,
  about: { shelterId: ShelterId | null; recipientUserId: string | null },
): Promise<TransactionalSendResult> {
  const sends = notificationSendsRepo(deps.db);
  const won = await sends.claim(deps.now(), {
    dedupKey: idempotencyKey,
    kind: email.template,
    shelterId: about.shelterId,
    recipientUserId: about.recipientUserId,
  });
  if (!won) return "duplicate";

  let status: "sent" | "failed" = "failed";
  let unanswered = false;
  try {
    const outcome = await sendChecked(deps.mail, registrationEmailOf(email, to));
    if (outcome.kind === "sent") status = "sent";
    else
      deps.log(`[registration] ${email.template} to ${maskAddress(to)} not sent: ${outcome.kind}`);
  } catch (error) {
    if (error instanceof ProviderSendError && error.status === null) unanswered = true;
    deps.log(`[registration] ${email.template} to ${maskAddress(to)} not sent: failed`);
  }
  if (unanswered) await sends.closeFailed(deps.now(), idempotencyKey);
  else await sends.mark(deps.now(), idempotencyKey, status);
  return status;
}
