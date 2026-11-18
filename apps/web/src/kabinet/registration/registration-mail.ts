import type { ApplicationSummary } from "@opika/db/repos";
import type { ShelterId } from "@opika/domain";
import { uk } from "@opika/i18n";
import { after } from "next/server";
import type { RateLimiter } from "../../api/rate-limit";
import { OPERATOR_CONTACT, SITE_ORIGIN } from "../../brand";
import { channelText } from "../../features/kabinet/profile-edit/fields";
import { OPERATOR_HOME } from "../../features/kabinet/routes";
import { mailCapKeyOf, REGISTRATION_MAIL_DAILY_CAP } from "../../features/registration/limits";
import { userHashOf } from "../notify/dedup";
import { notifyRuntimeOf } from "../notify/runtime";
import {
  type RegistrationEmailDeps,
  sendTransactionalEmail,
  type TransactionalSendResult,
} from "../registration-email";
import { registrationLinkOf } from "./registration-links";

/** What every registration email needs: the sender, the site's origin and the operator's name. */
export type RegistrationMail = {
  deps: RegistrationEmailDeps;
  baseURL: string;
  operatorName: string;
};

/**
 * The kabinet's one transactional sender (registration, resend, the operator's mails, queue
 * decisions) and when a handed-over send runs: after the response when served, inline in tests.
 */
export type TransactionalMail = {
  mail: RegistrationMail;
  schedule: (work: () => Promise<void>) => void;
};

/**
 * The served one: the notification mail's runtime (the provider in production once sign-in is
 * on, the console in development, none otherwise), its sends run by `after()` so no answer waits.
 */
export function servedTransactionalMail(
  env: Readonly<Record<string, string | undefined>>,
  db: RegistrationEmailDeps["db"],
): TransactionalMail | null {
  const runtime = notifyRuntimeOf(env);
  if (runtime.kind === "off") return null;
  return {
    mail: {
      deps: {
        db,
        mail: runtime.mail,
        now: () => new Date(),
        // biome-ignore lint/suspicious/noConsole: the masked line is the only trace of an unsent mail
        log: (line) => console.warn(line),
      },
      baseURL: runtime.context.baseURL,
      operatorName: runtime.context.operatorName,
    },
    schedule: (work) => after(work),
  };
}

/** Per user for the first email; a resend adds its minute, so a double click mails once. */
export const confirmationDedupKey = (userId: string, resendAt?: Date): string =>
  resendAt === undefined
    ? `application_confirm:${userHashOf(userId)}`
    : `application_confirm:${userHashOf(userId)}:${Math.floor(resendAt.getTime() / 60_000)}`;

export async function sendConfirmationEmail(
  mail: RegistrationMail,
  input: {
    userId: string;
    shelterId: ShelterId;
    name: string;
    email: string;
    confirmToken: string;
    notMeToken: string;
  },
  dedupKey: string,
): Promise<TransactionalSendResult> {
  return sendTransactionalEmail(
    mail.deps,
    {
      template: "application_confirm",
      name: input.name,
      confirmUrl: registrationLinkOf(mail.baseURL, "confirm_email", input.confirmToken),
      notMeUrl: registrationLinkOf(mail.baseURL, "not_me", input.notMeToken),
      operatorName: mail.operatorName,
    },
    input.email,
    dedupKey,
    { shelterId: input.shelterId, recipientUserId: input.userId },
  );
}

/** D6: one email to hello@ per application, once its address is confirmed. */
export async function sendOperatorNotification(
  mail: RegistrationMail,
  application: ApplicationSummary,
): Promise<TransactionalSendResult> {
  return sendTransactionalEmail(
    mail.deps,
    {
      template: "operator_new_application",
      name: application.displayName,
      cityName: application.cityName,
      link: application.link ?? "",
      // The queue card's wording for an application that gave no contact.
      contact:
        application.contact === null
          ? `${uk.kabinet.profile.contactsTitle}: ${uk.kabinet.profileNotRecorded}`
          : channelText(application.contact),
      email: application.email,
      queueUrl: new URL(OPERATOR_HOME, mail.baseURL).toString(),
    },
    OPERATOR_CONTACT.email,
    `operator_new_application:${application.shelterId}`,
    { shelterId: application.shelterId, recipientUserId: null },
  );
}

/** Once per UTC day, the day the cap's key counts: `notification_sends` claims it atomically. */
export const capAlarmDedupKey = (now: Date): string =>
  `registration_cap_hit:${now.toISOString().slice(0, 10)}`;

/** The operator's alarm: the cap and the queue's link, nothing about any applicant. */
export async function sendCapAlarm(
  mail: RegistrationMail,
  now: Date,
): Promise<TransactionalSendResult> {
  return sendTransactionalEmail(
    mail.deps,
    {
      template: "registration_cap_hit",
      count: REGISTRATION_MAIL_DAILY_CAP,
      // The live site's S1, whatever deployment noticed the cap (owner, 2026-11-18).
      queueUrl: new URL(OPERATOR_HOME, SITE_ORIGIN).toString(),
    },
    OPERATOR_CONTACT.email,
    capAlarmDedupKey(now),
    { shelterId: null, recipientUserId: null },
  );
}

/**
 * One of the day's confirmation emails (registration or resend), or false at the cap. At the cap
 * the operator is told, once that day, after the response; a failed alarm changes nothing.
 */
export async function takeDailyConfirmationMail(
  cap: RateLimiter,
  mail: RegistrationMail | null,
  now: Date,
  schedule: (work: () => Promise<void>) => void,
): Promise<boolean> {
  if (await cap.check(mailCapKeyOf(now), now)) return true;
  if (mail !== null) {
    schedule(async () => {
      await sendCapAlarm(mail, now).catch(() => undefined);
    });
  }
  return false;
}
