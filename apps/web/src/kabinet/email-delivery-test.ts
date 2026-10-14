import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { uk } from "@opika/i18n";
import { INVITE_LINK, linkTo, SIGN_IN_LINK } from "./email-links";
import { emailBody } from "./email-message";
import { emailProviderConfigOf, fetchEmailSender, type SentEmail } from "./email-provider";

/**
 * The delivery test Oleksii runs by hand (email setup handoff, 2026-10-13:
 * "Run it now against my Gmail only: the magic-link email and the invite
 * email, real-length placeholder text"). Two sends through the one provider
 * module, Brevo, from the verified sender on mail.<production host>; the
 * links carry TEST tokens that mean nothing, so a click proves the redirect
 * reaches the confirm page and nothing more.
 *
 * The key is read from the repo-root .env.local, that one key only (the way
 * prod-guard.ts reads PROD_NEON_ENDPOINT), and never printed: the output is
 * the HTTP status and the provider's message id per send.
 */

/** The only key this reads. Oleksii keeps it in .env.local; it is never committed or logged. */
export const DELIVERY_KEY_NAME = "BREVO_API_KEY";

/** The verified sender's local part; the domain is mail.<production host>, enforced by emailProviderConfigOf. */
const FROM_LOCAL_PART = "noreply";

/** Reads one key from a dotenv file, nothing else from it. Missing file or key: undefined. */
export function readSingleKey(file: string, key: string): string | undefined {
  if (!existsSync(file)) return undefined;
  try {
    return parseEnv(readFileSync(file, "utf8"))[key] || undefined;
  } catch {
    return undefined;
  }
}

export type DeliveryTestInput = {
  to: string | undefined;
  apiKey: string | undefined;
  /** The production origin; the From domain is mail. + its host. */
  origin: string;
  /** Where the links point (the local dev server by default). */
  base: string;
  /** From the app config (EMAIL_FROM_NAME), never a literal. */
  fromName: string | undefined;
  fetchImpl?: typeof fetch;
  /** A fresh random string per link: test tokens, never real ones. */
  random: () => string;
  log: (line: string) => void;
};

/**
 * Long enough to look like a real email to a spam filter; marked pending,
 * since the Ukrainian is Oleksii's. Built by the same `emailBody` as the real
 * emails, so the HTML link's text is the copy sheet's label key, never the
 * URL (IN-E8), and the plain-text part carries the raw URL.
 */
const placeholder = (to: string, subject: string, lead: string, label: string, link: string) => {
  const filler =
    "This paragraph stands in for the final text, which is still being written. It runs to a realistic length so that the provider, the mail scanners and the spam filter see something shaped like the real message rather than a one-line test. ";
  return emailBody(to, {
    subject,
    before: [`[COPY PENDING] ${lead}`],
    link: { label, url: link },
    after: [filler.repeat(3).trim(), "If you didn't ask for this, you can ignore it."],
  });
};

export async function runDeliveryTest(input: DeliveryTestInput): Promise<0 | 1> {
  if (!input.to?.includes("@")) {
    input.log("Usage: --to <address> is required.");
    return 1;
  }
  // The handoff fixes the sender as a named one; a bare address reads as
  // anonymous and would make the test unrepresentative (review of 747a011).
  if (!input.fromName?.trim()) {
    input.log("No From name: pass --from-name or set EMAIL_FROM_NAME. Nothing sent.");
    return 1;
  }
  if (!input.apiKey) {
    input.log(`${DELIVERY_KEY_NAME} is not set in the repo-root .env.local. Nothing sent.`);
    return 1;
  }
  const originHost = (() => {
    try {
      return new URL(input.origin).host;
    } catch {
      return "";
    }
  })();
  const config = emailProviderConfigOf({
    EMAIL_PROVIDER: "brevo",
    EMAIL_PROVIDER_API_KEY: input.apiKey,
    EMAIL_FROM_ADDRESS: `${FROM_LOCAL_PART}@mail.${originHost}`,
    EMAIL_FROM_NAME: input.fromName,
    PRODUCTION_ORIGIN: input.origin,
  });
  if (config.kind !== "configured") {
    const why = config.kind === "missing" ? `missing ${config.missing.join(", ")}` : config.reason;
    input.log(`Not configured: ${why}. Nothing sent.`);
    return 1;
  }
  const sender = fetchEmailSender(config.config, input.fetchImpl);
  const sends: {
    label: string;
    subject: string;
    target: { path: string; param: string };
    lead: string;
    linkLabel: string;
  }[] = [
    {
      label: "magic link",
      subject: "[COPY PENDING] Your sign-in link",
      target: SIGN_IN_LINK,
      lead: "Open this link and press the button to sign in. The link works once and expires soon.",
      linkLabel: uk.kabinet.email.signIn.action,
    },
    {
      label: "invite",
      subject: "[COPY PENDING] You've been invited to a shelter's cabinet",
      target: INVITE_LINK,
      lead: "You've been invited to manage a shelter's listings. Open this link to accept; the page will send you a sign-in link.",
      linkLabel: uk.kabinet.email.invite.action,
    },
  ];
  let failed = false;
  for (const send of sends) {
    const link = linkTo(input.base, send.target, `TEST-${input.random()}`);
    try {
      const sent: SentEmail = await sender.send(
        placeholder(input.to, send.subject, send.lead, send.linkLabel, link),
      );
      input.log(
        `${send.label}: status ${sent.status}, message id ${sent.messageId ?? "(none given)"}`,
      );
    } catch (error) {
      // The module's own error names the provider and status only.
      input.log(`${send.label}: FAILED (${(error as Error).message})`);
      failed = true;
    }
  }
  return failed ? 1 : 0;
}
