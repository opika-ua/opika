/**
 * One email as data: what every template builds and the kit renders twice, as HTML and as the plain
 * text part, so the two can never say different things. Strings arrive filled; the kit holds none.
 */

/** Information is lavender, success mint, warning peach; never red (plan §3). */
export type InfoBoxKind = "information" | "success" | "warning";

export type EmailBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "button"; label: string; url: string }
  | { kind: "box"; tone: InfoBoxKind; text: string }
  | { kind: "divider" }
  | { kind: "secondaryLink"; label: string; url: string };

/** Who the mail is for: a registrant's and a shelter admin's carry a reason line, the operator's none. */
export type EmailRecipient = "registrant" | "shelterAdmin" | "operator";

export type EmailModel = {
  subject: string;
  /** The hidden line the inbox shows under the subject. */
  preheader: string;
  heading: string;
  blocks: readonly EmailBlock[];
  /** Null where no one reason fits every address it goes to (the sign-in link). */
  recipient: EmailRecipient | null;
};

/** The footer and fallback wording, filled (`uk.emailLayout`, `uk.about.independent`, `brand.ts`). */
export type EmailChromeCopy = {
  fallbackLink: string;
  reason: Record<Exclude<EmailRecipient, "operator">, string>;
  independence: string;
  contact: string;
  logoAlt: string;
};
