import { looksLikeUrl } from "../email-message";
import type { OutgoingEmail } from "../email-provider";
import type { RegistrationEmail } from "../registration-email";
import { safeSubject } from "../safe-subject";
import type { EmailModel } from "./model";
import { renderEmail } from "./render";
import { type EmailTemplateInput, emailChromeCopy, emailModelOf } from "./templates";

/**
 * The account emails sent through the kit (plan step 3): the registration confirmation, the
 * application's approval and rejection, the sign-in link and the password reset. Each keeps its
 * subject, recipient and approved strings, and the link it is given goes out exactly as given:
 * the button's href, the fallback line and the text part all carry that one URL. Senders import
 * this module lazily, so React Email loads only when a mail is built.
 */

/** IN-E8, as `emailBody` enforces it: a link's text is a label, never a URL. */
function refuseUrlLabels(model: EmailModel): void {
  for (const block of model.blocks) {
    if ((block.kind === "button" || block.kind === "secondaryLink") && looksLikeUrl(block.label)) {
      throw new Error("An email link's text must be a label, never a URL (IN-E8).");
    }
  }
}

/** One model through the kit, its link labels checked first. */
export async function kitEmail(to: string, model: EmailModel): Promise<OutgoingEmail> {
  refuseUrlLabels(model);
  const { subject, html, text } = await renderEmail(model, emailChromeCopy());
  return { to, subject, html, text };
}

/** E1, the magic link. Its link is the sign-in confirm page (IN-E1). */
export function signInEmail(input: {
  to: string;
  url: string;
  ttlMinutes: number;
  operatorName: string;
}): Promise<OutgoingEmail> {
  return kitEmail(input.to, emailModelOf({ template: "sign_in", ...input }));
}

/** F1, the reset link, to a shelter admin's own address only (`RESET_LINK`). */
export function passwordResetEmail(input: {
  to: string;
  url: string;
  ttlMinutes: number;
  operatorName: string;
}): Promise<OutgoingEmail> {
  return kitEmail(input.to, emailModelOf({ template: "password_reset", ...input }));
}

/** The registration emails the kit renders; the operator's three still go through `emailBody`. */
export type KitRegistrationEmail = Extract<
  RegistrationEmail,
  { template: "application_confirm" | "application_approved" | "application_rejected" }
>;

const KIT_REGISTRATION_TEMPLATES: ReadonlySet<RegistrationEmail["template"]> = new Set([
  "application_confirm",
  "application_approved",
  "application_rejected",
]);

export const isKitRegistrationEmail = (email: RegistrationEmail): email is KitRegistrationEmail =>
  KIT_REGISTRATION_TEMPLATES.has(email.template);

const inputOf = (email: KitRegistrationEmail): EmailTemplateInput => {
  switch (email.template) {
    case "application_confirm":
      return {
        template: "application_confirm",
        name: email.name,
        confirmUrl: email.confirmUrl,
        notMeUrl: email.notMeUrl,
      };
    case "application_approved":
      return { template: "application_approved", name: email.name, kabinetUrl: email.kabinetUrl };
    case "application_rejected":
      return {
        template: "application_rejected",
        name: email.name,
        reason: email.reason,
        contactEmail: email.contactEmail,
        telegram: email.telegram,
      };
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled template; unreachable at runtime */
    default: {
      const unreachable: never = email;
      return unreachable;
    }
  }
};

/**
 * A registration email through the kit. Its subject carries applicant text, so it goes through
 * `safeSubject` (header injection, §11.3) and the `h1` shows the same cleaned line.
 */
export function registrationKitEmail(
  email: KitRegistrationEmail,
  to: string,
): Promise<OutgoingEmail> {
  const model = emailModelOf(inputOf(email));
  const subject = safeSubject(model.subject);
  return kitEmail(to, { ...model, subject, heading: subject });
}
