import type { ApplicationRejectionReason, ShelterId } from "@opika/domain";
import { OPERATOR_CONTACT } from "../../brand";
import type { RegistrationMail } from "../registration/registration-mail";
import {
  type RegistrationEmail,
  sendTransactionalEmail,
  type TransactionalSendResult,
} from "../registration-email";

/** What a queue decision tells the registrant (A4): one email per shelter and decision. */
export type ApplicationDecisionMail = {
  shelterId: ShelterId;
  name: string;
  to: string;
  recipientUserId: string;
} & ({ kind: "approved" } | { kind: "rejected"; reason: ApplicationRejectionReason });

export function applicationDecisionEmailOf(
  mail: ApplicationDecisionMail,
  baseURL: string,
): RegistrationEmail {
  return mail.kind === "approved"
    ? {
        template: "application_approved",
        name: mail.name,
        kabinetUrl: new URL("/kabinet", baseURL).toString(),
      }
    : {
        template: "application_rejected",
        name: mail.name,
        reason: mail.reason,
        contactEmail: OPERATOR_CONTACT.email,
        telegram: OPERATOR_CONTACT.telegram,
      };
}

/** Keyed per shelter (§11.6): a retried or repeated decision mails nobody twice. */
export const applicationDecisionKeyOf = (mail: ApplicationDecisionMail): string =>
  `${mail.kind === "approved" ? "application_approved" : "application_rejected"}:${mail.shelterId}`;

export function sendApplicationDecision(
  sender: RegistrationMail,
  mail: ApplicationDecisionMail,
): Promise<TransactionalSendResult> {
  return sendTransactionalEmail(
    sender.deps,
    applicationDecisionEmailOf(mail, sender.baseURL),
    mail.to,
    applicationDecisionKeyOf(mail),
    { shelterId: mail.shelterId, recipientUserId: mail.recipientUserId },
  );
}
