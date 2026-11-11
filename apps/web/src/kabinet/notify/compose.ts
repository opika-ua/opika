import { CONFIRMATION_REMINDER_DAYS, KYIV_TIME_ZONE } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import { countPhrase } from "../../features/kabinet/shared/count-phrase";
import { emailBody } from "../email-message";
import type { OutgoingEmail } from "../email-provider";
import type { NotificationIntent } from "./intents";

/** What a notification's wording and links need from the deployment, never from the intent. */
export type ComposeContext = {
  /** The origin emailed links point at (`BETTER_AUTH_URL`). */
  baseURL: string;
  /** Nominative display name that signs a shelter's mail (`operatorDisplayName`). */
  operatorName: string;
};

/** «24 листопада», on Kyiv's clock: the day it is in Ukraine whatever zone the server runs in. */
const formatDayMonth = (date: Date): string =>
  new Intl.DateTimeFormat("uk-UA", {
    day: "numeric",
    month: "long",
    timeZone: KYIV_TIME_ZONE,
  }).format(date);

const linkOn = (baseURL: string, path: string): string =>
  new URL(path, `${baseURL.replace(/\/+$/, "")}/`).toString();

/**
 * The mail an intent calls for, to one address. Operator mails carry no greeting and no
 * signature; a shelter's open «Добрий день.» and end `{operator}`. A label that looks like a
 * URL throws here (`emailBody`, IN-E8), so a bad edit to the catalogue fails loudly and the
 * caller marks the send failed instead of sending it.
 */
export function composeNotification(
  intent: NotificationIntent,
  to: string,
  context: ComposeContext,
): OutgoingEmail {
  const shelter = intent.shelterName;
  const operator = context.operatorName;
  const operatorLink = (label: string) => ({
    label,
    url: linkOn(context.baseURL, `/kabinet/prytulky/${intent.shelterId}`),
  });
  const shelterLink = (label: string, path: string) => ({
    label,
    url: linkOn(context.baseURL, path),
  });
  switch (intent.kind) {
    case "reviewRequested": {
      const copy = uk.kabinet.email.reviewRequested;
      return emailBody(to, {
        subject: fillTemplate(copy.subject, { shelter }),
        before: [fillTemplate(copy.body, { shelter })],
        link: operatorLink(copy.action),
        after: [],
      });
    }
    case "donationProposed": {
      const copy = uk.kabinet.email.donationProposed;
      return emailBody(to, {
        subject: fillTemplate(copy.subject, { shelter }),
        before: [fillTemplate(copy.body, { shelter, host: intent.host })],
        link: operatorLink(copy.action),
        after: [],
      });
    }
    case "earlyListingEnding": {
      const copy = uk.kabinet.email.earlyListingEnding;
      return emailBody(to, {
        subject: fillTemplate(copy.subject, { shelter }),
        before: [
          fillTemplate(copy.body, { shelter, date: formatDayMonth(intent.expiresAt) }),
          ...(intent.period === 1 ? [copy.extendable] : []),
        ],
        link: operatorLink(copy.action),
        after: [],
      });
    }
    case "approved": {
      const copy = uk.kabinet.email.approved;
      return emailBody(to, {
        subject: copy.subject,
        before: [fillTemplate(copy.body, { shelter })],
        link: shelterLink(copy.action, "/kabinet"),
        after: [fillTemplate(copy.help, { operator })],
      });
    }
    case "earlyListingAllowed": {
      const copy = uk.kabinet.email.earlyListingAllowed;
      return emailBody(to, {
        subject: copy.subject,
        before: [fillTemplate(copy.body, { shelter, date: formatDayMonth(intent.expiresAt) })],
        link: shelterLink(copy.action, "/kabinet/tvaryny"),
        after: [fillTemplate(copy.help, { operator })],
      });
    }
    case "donationApproved": {
      const copy = uk.kabinet.email.donationApproved;
      const visibility = intent.shownNow ? copy.shownNow : copy.notYet;
      return emailBody(to, {
        subject: copy.subject,
        before: [`${fillTemplate(copy.body, { host: intent.host })} ${visibility}`],
        link: shelterLink(copy.action, "/kabinet/prytulok"),
        after: [fillTemplate(copy.help, { operator })],
      });
    }
    case "donationRejected": {
      const copy = uk.kabinet.email.donationRejected;
      return emailBody(to, {
        subject: copy.subject,
        before: [fillTemplate(copy.body, { host: intent.host })],
        link: shelterLink(copy.action, "/kabinet/prytulok"),
        after: [fillTemplate(copy.help, { operator })],
      });
    }
    case "freshnessReminder": {
      const copy = uk.kabinet.email.freshnessReminder;
      return emailBody(to, {
        subject: countPhrase(intent.staleCards, copy.subject),
        before: [
          fillTemplate(copy.body, {
            cards: countPhrase(intent.staleCards, uk.kabinet.animalList.stale.countCards),
            shelter,
            days: countPhrase(CONFIRMATION_REMINDER_DAYS, uk.kabinet.units.days),
          }),
        ],
        link: shelterLink(copy.action, "/kabinet/tvaryny"),
        after: [`${copy.frequency} ${fillTemplate(copy.stop, { operator })}`],
      });
    }
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled kind; unreachable at runtime */
    default: {
      const unreachable: never = intent;
      return unreachable;
    }
  }
}
