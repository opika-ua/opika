import { uk } from "@opika/i18n";
import type { OutgoingEmail } from "./email-provider";

/**
 * How every kabinet email's body is assembled: paragraphs, one link, more
 * paragraphs, as an HTML part and a plain-text part.
 *
 * The link is the reason this module exists (IN-E8, Oleksii, 2026-10-14):
 * Brevo rewrites every href through its click tracker, so an HTML link whose
 * text is the raw URL shows one domain while pointing at another, which spam
 * filters read as phishing. In HTML the link's text is therefore always a
 * label, never a URL, and `emailBody` refuses a label that looks like one.
 * The plain-text part carries the raw URL on its own line: there is no
 * anchor there to disagree with, and Brevo doesn't rewrite it today
 * (a test pins that what we send is the exact URL).
 */

export type EmailLink = { label: string; url: string };

export type EmailParts = {
  subject: string;
  before: readonly string[];
  link: EmailLink;
  after: readonly string[];
};

/**
 * A label that names a location instead of an action, anywhere in it: a
 * scheme (`https://`, `mailto:`), `www.`, or a dotted hostname ending in a
 * TLD-like run of letters (`opika.org.ua`, `приклад.укр`). Anywhere, not only
 * at the start (review of 5f9e7c4, finding 3): «Перейти на opika.org.ua»
 * shows a domain the tracked href doesn't match, exactly what IN-E8 forbids.
 * Sentence punctuation passes, since a period followed by a space or the end
 * isn't a hostname. It errs toward refusing (`Node.js`, `м.Київ`): a refused
 * label fails loudly at build time, a passed one ships a phishing signal.
 */
export function looksLikeUrl(label: string): boolean {
  return (
    /[a-z][a-z0-9+.-]*:\/\//i.test(label) ||
    /(^|[^\p{L}\p{N}])mailto:/iu.test(label) ||
    /(^|[^\p{L}\p{N}])www\./iu.test(label) ||
    /[\p{L}\p{N}-]\.\p{L}{2,}(?![\p{L}\p{N}])/u.test(label)
  );
}

const escapeHtml = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export function emailBody(to: string, parts: EmailParts): OutgoingEmail {
  if (looksLikeUrl(parts.link.label)) {
    throw new Error("An email link's text must be a label, never a URL (IN-E8).");
  }
  // A line break inside one paragraph (the invite's `— {operator}` signature
  // under its last sentence) stays a line break in HTML, not a collapsed space.
  const paragraph = (text: string) => `<p>${escapeHtml(text).replaceAll("\n", "<br>")}</p>`;
  const html = [
    ...parts.before.map(paragraph),
    `<p><a href="${escapeHtml(parts.link.url)}">${escapeHtml(parts.link.label)}</a></p>`,
    ...parts.after.map(paragraph),
  ].join("");
  const text = [...parts.before, parts.link.url, ...parts.after].join("\n\n");
  return { to, subject: parts.subject, html, text };
}

/** `{name}` placeholders filled from `values`; a placeholder with no value is left visible, never blanked. */
const fill = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (whole, name: string) => values[name] ?? whole);

/** E1: the magic-link email. Its link is the sign-in confirm page (IN-E1: a GET never consumes the token). */
export function magicLinkEmail(input: {
  to: string;
  url: string;
  ttlMinutes: number;
}): OutgoingEmail {
  const copy = uk.kabinet.email.signIn;
  return emailBody(input.to, {
    subject: copy.subject,
    before: [copy.intro],
    link: { label: copy.action, url: input.url },
    after: [fill(copy.expiry, { minutes: String(input.ttlMinutes) }), copy.notYou],
  });
}

/**
 * E2: the invite email. Not a sign-in link (IN-Q3): it opens the invite
 * landing. Oleksii's final copy (2026-10-14) is a personal note: the intro has
 * no `{operator}`, and the name signs the last line instead (`— {operator}`,
 * nominative, `operatorDisplayName`'s value).
 */
export function invitationEmail(input: {
  to: string;
  url: string;
  shelterName: string;
  operatorName: string;
  ttlHours: number;
}): OutgoingEmail {
  const copy = uk.kabinet.email.invite;
  return emailBody(input.to, {
    subject: copy.subject,
    before: [
      fill(copy.intro, { operator: input.operatorName, shelter: input.shelterName }),
      copy.what,
    ],
    link: { label: copy.action, url: input.url },
    after: [
      fill(copy.expiry, { hours: String(input.ttlHours) }),
      fill(copy.notYou, { operator: input.operatorName }),
    ],
  });
}
