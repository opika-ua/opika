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

/** Who the mail is for: the footer's reason line follows it. */
export type EmailRecipient = "registrant" | "shelterAdmin" | "operator";

export type EmailModel = {
  subject: string;
  /** The hidden line the inbox shows under the subject. */
  preheader: string;
  heading: string;
  blocks: readonly EmailBlock[];
  /** Null where no one reason fits every address it goes to (the sign-in link). */
  recipient: EmailRecipient | null;
  /** The weekly reminder's switch-off link, once one exists. */
  switchOffUrl?: string;
};

/** The footer and fallback wording, filled; from the catalogue once approved (`pending-copy.ts`). */
export type EmailChromeCopy = {
  fallbackLink: string;
  reason: Record<EmailRecipient, string>;
  independence: string;
  contact: string;
  switchOffPrompt: string;
  switchOffAction: string;
  logoAlt: string;
};
