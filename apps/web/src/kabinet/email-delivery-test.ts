import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { INVITATION_TTL_MS } from "@opika/db/repos";
import { COPY_PENDING, pendingCopyPaths, uk } from "@opika/i18n";
import { INVITE_LINK, linkTo, SIGN_IN_LINK } from "./email-links";
import { invitationEmail, magicLinkEmail } from "./email-message";
import {
  emailProviderConfigOf,
  fetchEmailSender,
  type OutgoingEmail,
  type SentEmail,
} from "./email-provider";
import { MAGIC_LINK_TTL_SECONDS } from "./magic-link-sender";
import { operatorDisplayName } from "./operator";

/**
 * The delivery test Oleksii runs by hand (email setup handoff, 2026-10-13:
 * "Run it now against my Gmail only: the magic-link email and the invite
 * email, real-length placeholder text"). Its second run (IN-E15) sends the
 * final Ukrainian through the real templates: `magicLinkEmail` and
 * `invitationEmail`, the builders production uses, with the real TTLs, a
 * fictional shelter, the operator name signing both emails, from the app config
 * (`--operator-name`, else `KABINET_OPERATOR_DISPLAY_NAME`, else the
 * catalogue fallback) and links on `--base` carrying TEST tokens that mean
 * nothing, so a click proves the redirect reaches the page and nothing more.
 * It refuses while any template string is still `[COPY PENDING]`. Two sends
 * through the one provider module, Brevo, from the verified sender on
 * mail.<production host>.
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
  /** From the app config (EMAIL_REPLY_TO), never a literal: every email carries a Reply-To (Oleksii, 2026-10-14, answer 5). */
  replyTo: string | undefined;
  /** Both emails sign with this (`— {operator}`): app config, never a literal; unset, the catalogue fallback. */
  operatorName: string | undefined;
  /** Injectable so the refusal is testable now the live copy is final; the script takes the default, the live catalogue. */
  pendingTemplateCopy?: readonly string[];
  fetchImpl?: typeof fetch;
  /** A fresh random string per link: test tokens, never real ones. */
  random: () => string;
  log: (line: string) => void;
};

/** Fictional: the delivery test names no real shelter (no real shelter data in the repository). */
export const DELIVERY_TEST_SHELTER_NAME = "Тестовий";

/** Every email-template string still `[COPY PENDING]`, by full path; the live catalogue's. */
const pendingTemplateCopy = (): string[] => pendingCopyPaths(uk.kabinet.email, "kabinet.email");

export async function runDeliveryTest(input: DeliveryTestInput): Promise<0 | 1> {
  if (!input.to?.includes("@")) {
    input.log("Usage: --to <address> is required.");
    return 1;
  }
  // IN-E15: this run tests the final emails. With any template string still a
  // placeholder it would test something else, so it refuses outright.
  const pending = input.pendingTemplateCopy ?? pendingTemplateCopy();
  if (pending.length > 0) {
    input.log(`Email copy still pending (${pending.join(", ")}). Nothing sent.`);
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
    EMAIL_REPLY_TO: input.replyTo,
    PRODUCTION_ORIGIN: input.origin,
  });
  if (config.kind !== "configured") {
    const why = config.kind === "missing" ? `missing ${config.missing.join(", ")}` : config.reason;
    input.log(`Not configured: ${why}. Nothing sent.`);
    return 1;
  }
  const sender = fetchEmailSender(config.config, input.fetchImpl);
  const operatorName = operatorDisplayName({ KABINET_OPERATOR_DISPLAY_NAME: input.operatorName });
  const testLink = (target: { path: string; param: string }) =>
    linkTo(input.base, target, `TEST-${input.random()}`);
  // The real builders and the real TTLs: what a shelter would receive, with
  // test links and a fictional shelter in place of real ones.
  const sends: { label: string; email: OutgoingEmail }[] = [
    {
      label: "magic link",
      email: magicLinkEmail({
        to: input.to,
        url: testLink(SIGN_IN_LINK),
        ttlMinutes: MAGIC_LINK_TTL_SECONDS / 60,
        operatorName,
      }),
    },
    {
      label: "invite",
      email: invitationEmail({
        to: input.to,
        url: testLink(INVITE_LINK),
        shelterName: DELIVERY_TEST_SHELTER_NAME,
        operatorName,
        ttlHours: INVITATION_TTL_MS / 3_600_000,
      }),
    },
  ];
  // A second guard on what was actually built, not only on the catalogue.
  if (
    sends.some(({ email }) =>
      [email.subject, email.html, email.text].some((part) => part.includes(COPY_PENDING)),
    )
  ) {
    input.log("A built email still holds [COPY PENDING] text. Nothing sent.");
    return 1;
  }
  let failed = false;
  for (const send of sends) {
    try {
      const sent: SentEmail = await sender.send(send.email);
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
