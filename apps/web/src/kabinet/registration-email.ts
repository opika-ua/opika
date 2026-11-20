import type { Database } from "@opika/db";
import { notificationSendsRepo } from "@opika/db/repos";
import type { ApplicationRejectionReason, ShelterId } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import { emailBody } from "./email-message";
import { type OutgoingEmail, ProviderSendError } from "./email-provider";
import { maskAddress, type ProviderMail, sendChecked } from "./email-senders";
import { safeSubject } from "./safe-subject";

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
  "notification_cap_warning",
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
    }
  | {
      /** Operator only, once a Kyiv day: notification mails reached 80% of their cap. No recipient data. */
      template: "notification_cap_warning";
      count: number;
      cap: number;
    };

export { safeSubject } from "./safe-subject";

/** The operator's three registration mails, still in the plain `emailBody` (plan step 5). */
export type PlainRegistrationEmail = Extract<
  RegistrationEmail,
  { template: "operator_new_application" | "registration_cap_hit" | "notification_cap_warning" }
>;

export function registrationEmailOf(email: PlainRegistrationEmail, to: string): OutgoingEmail {
  const copy = uk.kabinet.email;
  switch (email.template) {
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
        link: { label: c.action, url: email.queueUrl },
        after: [],
      });
    }
    case "notification_cap_warning": {
      const c = copy.notificationCapWarning;
      return emailBody(to, {
        subject: safeSubject(c.subject),
        before: [fillTemplate(c.body, { count: String(email.count), cap: String(email.cap) })],
        link: null,
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

/**
 * Any registration email, built: the registrant's three through the branded kit (plan step 3,
 * loaded only here, at send time), the operator's through `registrationEmailOf`.
 */
export async function registrationEmailFor(
  email: RegistrationEmail,
  to: string,
): Promise<OutgoingEmail> {
  const kit = await import("./emails/account-mail");
  return kit.isKitRegistrationEmail(email)
    ? kit.registrationKitEmail(email, to)
    : registrationEmailOf(email, to);
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
    const outcome = await sendChecked(deps.mail, await registrationEmailFor(email, to));
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
