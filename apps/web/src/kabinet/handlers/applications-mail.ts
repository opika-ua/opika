import type { ApplicationRejectionReason, ShelterId } from "@opika/domain";
import { after } from "next/server";
import { SITE_ORIGIN } from "../../brand";
import { kabinetDb } from "../kabinet-db";
import { notifyRuntimeOf } from "../notify/runtime";
import {
  type RegistrationEmail,
  type RegistrationEmailDeps,
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

/** Hands a committed decision's email over; the served one sends after the response. */
export type ApplicationMailer = (mail: ApplicationDecisionMail) => void;

export type ApplicationMailContext = {
  /** The origin emailed links point at, as the notification mails use. */
  baseURL: string;
  /** Where the rejection email says to write (A4's approved text names both). */
  contactEmail: string;
  telegram: string;
};

/** The operator's public contact from the approved copy (A4). */
export const OPERATOR_CONTACT = {
  contactEmail: `hello@${new URL(SITE_ORIGIN).host}`,
  telegram: "@oleshaz",
} as const;

export function applicationDecisionEmailOf(
  mail: ApplicationDecisionMail,
  context: ApplicationMailContext,
): RegistrationEmail {
  return mail.kind === "approved"
    ? {
        template: "application_approved",
        name: mail.name,
        kabinetUrl: new URL("/kabinet", context.baseURL).toString(),
      }
    : {
        template: "application_rejected",
        name: mail.name,
        reason: mail.reason,
        contactEmail: context.contactEmail,
        telegram: context.telegram,
      };
}

/** Keyed per shelter (§11.6): a retried or repeated decision mails nobody twice. */
export const applicationDecisionKeyOf = (mail: ApplicationDecisionMail): string =>
  `${mail.kind === "approved" ? "application_approved" : "application_rejected"}:${mail.shelterId}`;

export function sendApplicationDecision(
  deps: RegistrationEmailDeps,
  context: ApplicationMailContext,
  mail: ApplicationDecisionMail,
): Promise<TransactionalSendResult> {
  return sendTransactionalEmail(
    deps,
    applicationDecisionEmailOf(mail, context),
    mail.to,
    applicationDecisionKeyOf(mail),
    { shelterId: mail.shelterId, recipientUserId: mail.recipientUserId },
  );
}

function warn(line: string): void {
  // biome-ignore lint/suspicious/noConsole: the masked line is the only trace of an unsent mail
  console.warn(line);
}

/** The served route's mailer: the same provider gate as the notification mails, after the response. */
export const servedApplicationMailer =
  (env: Readonly<Record<string, string | undefined>>): ApplicationMailer =>
  (mail) => {
    const runtime = notifyRuntimeOf(env);
    if (runtime.kind === "off") return;
    after(async () => {
      await sendApplicationDecision(
        { db: kabinetDb(), mail: runtime.mail, now: () => new Date(), log: warn },
        { baseURL: runtime.context.baseURL, ...OPERATOR_CONTACT },
        mail,
      );
    });
  };
