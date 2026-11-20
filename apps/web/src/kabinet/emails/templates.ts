import type { ApplicationRejectionReason } from "@opika/domain";
import { CONFIRMATION_REMINDER_DAYS, KYIV_TIME_ZONE } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import { OPERATOR_CONTACT, WORDMARK } from "../../brand";
import { countPhrase } from "../../features/kabinet/shared/count-phrase";
import type { EmailBlock, EmailChromeCopy, EmailModel } from "./model";

/**
 * Every email the code sends today (inventory, branded-emails plan §4 step 1), as a kit model built
 * from the same approved strings and fills as its current builder (`kabinet/email-message.ts`,
 * `registration-email.ts`, `notify/compose.ts`). Nothing sends through these yet: wiring each
 * sender to its template is plan steps 3 to 5. The `h1` is the subject, the preheader the body's
 * opening sentence, so neither needs new copy.
 */
export const EMAIL_TEMPLATES = [
  "application_confirm",
  "application_approved",
  "application_rejected",
  "sign_in",
  "invite",
  "password_reset",
  "password_changed",
  "shelter_verified",
  "early_listing_allowed",
  "donation_approved",
  "donation_rejected",
  "freshness_reminder",
  "review_requested",
  "donation_proposed",
  "early_listing_ending",
  "operator_new_application",
  "registration_cap_hit",
  "notification_cap_warning",
] as const;
export type EmailTemplate = (typeof EMAIL_TEMPLATES)[number];

export type EmailTemplateInput =
  | { template: "application_confirm"; name: string; confirmUrl: string; notMeUrl: string }
  | { template: "application_approved"; name: string; kabinetUrl: string }
  | {
      template: "application_rejected";
      name: string;
      reason: ApplicationRejectionReason;
      contactEmail: string;
      telegram: string;
    }
  | { template: "sign_in"; url: string; ttlMinutes: number; operatorName: string }
  | {
      template: "invite";
      url: string;
      shelterName: string;
      operatorName: string;
      shelterVerification: "verified" | "not_yet_verified";
      ttlHours: number;
    }
  | { template: "password_reset"; url: string; ttlMinutes: number; operatorName: string }
  | { template: "password_changed"; contact: string; operatorName: string }
  | { template: "shelter_verified"; shelterName: string; kabinetUrl: string; operatorName: string }
  | {
      template: "early_listing_allowed";
      shelterName: string;
      expiresAt: Date;
      animalsUrl: string;
      operatorName: string;
    }
  | {
      template: "donation_approved";
      host: string;
      shownNow: boolean;
      profileUrl: string;
      operatorName: string;
    }
  | { template: "donation_rejected"; host: string; profileUrl: string; operatorName: string }
  | {
      template: "freshness_reminder";
      shelterName: string;
      staleCards: number;
      animalsUrl: string;
      operatorName: string;
    }
  | { template: "review_requested"; shelterName: string; shelterUrl: string }
  | { template: "donation_proposed"; shelterName: string; host: string; shelterUrl: string }
  | {
      template: "early_listing_ending";
      shelterName: string;
      expiresAt: Date;
      period: number;
      shelterUrl: string;
    }
  | {
      template: "operator_new_application";
      name: string;
      cityName: string;
      link: string;
      contact: string;
      email: string;
      queueUrl: string;
    }
  | { template: "registration_cap_hit"; count: number; queueUrl: string }
  | { template: "notification_cap_warning"; count: number; cap: number };

/** «24 листопада», on Kyiv's clock, as `notify/compose.ts` writes it. */
const dayMonth = (date: Date): string =>
  new Intl.DateTimeFormat("uk-UA", {
    day: "numeric",
    month: "long",
    timeZone: KYIV_TIME_ZONE,
  }).format(date);

const GREETINGS = new Set(["Добрий день.", "Вітаю."]);

/**
 * The preheader: the body's opening sentences, greeting skipped, until there is enough to read in
 * an inbox list. Only the first line, so a `{operator}` signature never leaks in.
 */
export function leadOf(body: string, atLeast = 30): string {
  const sentences = (body.split("\n")[0] ?? "")
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !GREETINGS.has(sentence));
  const taken: string[] = [];
  for (const sentence of sentences) {
    taken.push(sentence);
    if (taken.join(" ").length >= atLeast) break;
  }
  return taken.join(" ");
}

const p = (text: string): EmailBlock => ({ kind: "paragraph", text });
const button = (label: string, url: string): EmailBlock => ({ kind: "button", label, url });
const box = (tone: "information" | "success" | "warning", text: string): EmailBlock => ({
  kind: "box",
  tone,
  text,
});

type Shape = Omit<EmailModel, "preheader" | "heading"> & { lead: string };

const modelOf = (shape: Shape): EmailModel => {
  const { lead, ...rest } = shape;
  return { ...rest, heading: shape.subject, preheader: leadOf(lead) };
};

function shapeOf(input: EmailTemplateInput): Shape {
  const email = uk.kabinet.email;
  switch (input.template) {
    case "application_confirm": {
      const c = email.applicationConfirm;
      const body = fillTemplate(c.body, { name: input.name, site: WORDMARK });
      return {
        subject: fillTemplate(c.subject, { site: WORDMARK }),
        lead: body,
        recipient: "registrant",
        blocks: [
          p(body),
          button(c.action, input.confirmUrl),
          { kind: "divider" },
          p(c.notYou),
          { kind: "secondaryLink", label: c.notYouAction, url: input.notMeUrl },
        ],
      };
    }
    case "application_approved": {
      const c = email.applicationApproved;
      return {
        subject: fillTemplate(c.subject, { name: input.name }),
        lead: c.body,
        recipient: "registrant",
        blocks: [p(c.body), button(c.action, input.kabinetUrl), box("success", c.pending)],
      };
    }
    case "application_rejected": {
      const c = email.applicationRejected;
      const presets = uk.registration.rejectionReasons;
      const reason =
        input.reason.code === "other"
          ? fillTemplate(presets.other, { text: input.reason.note ?? "" })
          : presets[input.reason.code];
      const body = fillTemplate(c.body, { reason });
      return {
        subject: fillTemplate(c.subject, { name: input.name }),
        lead: body,
        recipient: "registrant",
        blocks: [
          box("warning", body),
          p(fillTemplate(c.contact, { email: input.contactEmail, telegram: input.telegram })),
          p(c.retention),
        ],
      };
    }
    case "sign_in": {
      const c = email.signIn;
      return {
        subject: c.subject,
        lead: c.intro,
        // Operator and shelter admins alike sign in with it: no reason line fits both.
        recipient: null,
        blocks: [
          p(c.intro),
          button(c.action, input.url),
          box(
            "information",
            fillTemplate(c.expiry, {
              minutes: countPhrase(input.ttlMinutes, uk.kabinet.units.minutes),
            }),
          ),
          p(fillTemplate(c.notYou, { operator: input.operatorName })),
        ],
      };
    }
    case "invite": {
      const c = email.invite;
      const intro = fillTemplate(c.intro, {
        operator: input.operatorName,
        shelter: input.shelterName,
        site: WORDMARK,
      });
      return {
        subject: c.subject,
        lead: intro,
        recipient: "shelterAdmin",
        blocks: [
          p(intro),
          p(input.shelterVerification === "verified" ? c.what : c.whatBeforeVerification),
          button(c.action, input.url),
          box(
            "information",
            fillTemplate(c.expiry, { hours: countPhrase(input.ttlHours, uk.kabinet.units.hours) }),
          ),
          p(fillTemplate(c.notYou, { operator: input.operatorName })),
        ],
      };
    }
    case "password_reset": {
      const c = email.reset;
      return {
        subject: c.subject,
        lead: c.intro,
        recipient: "shelterAdmin",
        blocks: [
          p(c.intro),
          button(c.action, input.url),
          box("information", fillTemplate(c.expiry, { minutes: String(input.ttlMinutes) })),
          p(fillTemplate(c.notYou, { operator: input.operatorName })),
        ],
      };
    }
    case "password_changed": {
      const c = email.passwordChanged;
      return {
        subject: c.subject,
        lead: c.body,
        recipient: "shelterAdmin",
        blocks: [
          p(c.body),
          p(fillTemplate(c.notYou, { contact: input.contact, operator: input.operatorName })),
        ],
      };
    }
    case "shelter_verified": {
      const c = email.approved;
      const body = fillTemplate(c.body, { shelter: input.shelterName });
      return {
        subject: c.subject,
        lead: body,
        recipient: "shelterAdmin",
        blocks: [
          p(body),
          button(c.action, input.kabinetUrl),
          p(fillTemplate(c.help, { operator: input.operatorName })),
        ],
      };
    }
    case "early_listing_allowed": {
      const c = email.earlyListingAllowed;
      const body = fillTemplate(c.body, {
        shelter: input.shelterName,
        date: dayMonth(input.expiresAt),
      });
      return {
        subject: c.subject,
        lead: body,
        recipient: "shelterAdmin",
        blocks: [
          p(body),
          button(c.action, input.animalsUrl),
          p(fillTemplate(c.help, { operator: input.operatorName })),
        ],
      };
    }
    case "donation_approved": {
      const c = email.donationApproved;
      const body = fillTemplate(c.body, { host: input.host });
      return {
        subject: c.subject,
        lead: body,
        recipient: "shelterAdmin",
        blocks: [
          p(body),
          box("success", input.shownNow ? c.shownNow : c.notYet),
          button(c.action, input.profileUrl),
          p(fillTemplate(c.help, { operator: input.operatorName })),
        ],
      };
    }
    case "donation_rejected": {
      const c = email.donationRejected;
      const body = fillTemplate(c.body, { host: input.host });
      return {
        subject: c.subject,
        lead: body,
        recipient: "shelterAdmin",
        blocks: [
          p(body),
          button(c.action, input.profileUrl),
          p(fillTemplate(c.help, { operator: input.operatorName })),
        ],
      };
    }
    case "freshness_reminder": {
      const c = email.freshnessReminder;
      const body = fillTemplate(c.body, {
        cards: countPhrase(input.staleCards, uk.kabinet.animalList.stale.countCards),
        shelter: input.shelterName,
        days: countPhrase(CONFIRMATION_REMINDER_DAYS, uk.kabinet.units.days),
      });
      return {
        subject: countPhrase(input.staleCards, c.subject),
        lead: body,
        recipient: "shelterAdmin",
        blocks: [
          p(body),
          button(c.action, input.animalsUrl),
          box("information", c.frequency),
          p(fillTemplate(c.stop, { operator: input.operatorName })),
        ],
      };
    }
    case "review_requested": {
      const c = email.reviewRequested;
      const body = fillTemplate(c.body, { shelter: input.shelterName });
      return {
        subject: fillTemplate(c.subject, { shelter: input.shelterName }),
        lead: body,
        recipient: "operator",
        blocks: [p(body), button(c.action, input.shelterUrl)],
      };
    }
    case "donation_proposed": {
      const c = email.donationProposed;
      const body = fillTemplate(c.body, { shelter: input.shelterName, host: input.host });
      return {
        subject: fillTemplate(c.subject, { shelter: input.shelterName }),
        lead: body,
        recipient: "operator",
        blocks: [p(body), button(c.action, input.shelterUrl)],
      };
    }
    case "early_listing_ending": {
      const c = email.earlyListingEnding;
      const body = fillTemplate(c.body, {
        shelter: input.shelterName,
        date: dayMonth(input.expiresAt),
      });
      return {
        subject: fillTemplate(c.subject, { shelter: input.shelterName }),
        lead: body,
        recipient: "operator",
        blocks: [
          box("warning", body),
          ...(input.period === 1 ? [box("information", c.extendable)] : []),
          button(c.action, input.shelterUrl),
        ],
      };
    }
    case "operator_new_application": {
      const c = email.operatorNewApplication;
      const facts = [input.name, input.cityName, input.link, input.contact, input.email].filter(
        (fact) => fact !== "",
      );
      return {
        subject: fillTemplate(c.subject, { name: input.name, city: input.cityName }),
        lead: facts.join(" · "),
        recipient: "operator",
        blocks: [p(facts.join("\n")), button(c.action, input.queueUrl)],
      };
    }
    case "registration_cap_hit": {
      const c = email.registrationCapHit;
      const body = fillTemplate(c.body, { count: String(input.count) });
      return {
        subject: c.subject,
        lead: body,
        recipient: "operator",
        blocks: [box("warning", body), button(c.action, input.queueUrl)],
      };
    }
    case "notification_cap_warning": {
      const c = email.notificationCapWarning;
      const body = fillTemplate(c.body, { count: String(input.count), cap: String(input.cap) });
      return {
        subject: c.subject,
        lead: body,
        recipient: "operator",
        blocks: [box("warning", body)],
      };
    }
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled template; unreachable at runtime */
    default: {
      const unreachable: never = input;
      return unreachable;
    }
  }
}

export const emailModelOf = (input: EmailTemplateInput): EmailModel => modelOf(shapeOf(input));

/** The kit's own wording, filled: footer lines, the fallback line and the logo's alt text. */
export function emailChromeCopy(): EmailChromeCopy {
  return {
    fallbackLink: uk.emailLayout.fallbackLink,
    reason: uk.emailLayout.reason,
    independence: fillTemplate(uk.about.independent, { site: WORDMARK }),
    contact: OPERATOR_CONTACT.email,
    logoAlt: WORDMARK,
  };
}
