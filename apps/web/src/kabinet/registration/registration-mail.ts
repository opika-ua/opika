import type { ApplicationSummary } from "@opika/db/repos";
import type { ShelterId } from "@opika/domain";
import { OPERATOR_CONTACT } from "../../brand";
import { channelText } from "../../features/kabinet/profile-edit/fields";
import { OPERATOR_HOME } from "../../features/kabinet/routes";
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
 * The notification mail's runtime, reused: the provider in production once sign-in is on, the
 * console in development, nothing where neither is configured.
 */
export function registrationMailOf(
  env: Readonly<Record<string, string | undefined>>,
  db: RegistrationEmailDeps["db"],
): RegistrationMail | null {
  const runtime = notifyRuntimeOf(env);
  if (runtime.kind === "off") return null;
  return {
    deps: {
      db,
      mail: runtime.mail,
      now: () => new Date(),
      // biome-ignore lint/suspicious/noConsole: the masked line is the only trace of an unsent mail
      log: (line) => console.warn(line),
    },
    baseURL: runtime.context.baseURL,
    operatorName: runtime.context.operatorName,
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
      contact: channelText(application.contact),
      email: application.email,
      queueUrl: new URL(OPERATOR_HOME, mail.baseURL).toString(),
    },
    OPERATOR_CONTACT.email,
    `operator_new_application:${application.shelterId}`,
    { shelterId: application.shelterId, recipientUserId: null },
  );
}
