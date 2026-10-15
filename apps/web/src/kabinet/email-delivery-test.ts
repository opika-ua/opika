import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { INVITATION_TTL_MS } from "@opika/db/repos";
import { COPY_PENDING, pendingCopyPaths, uk } from "@opika/i18n";
import { INVITE_LINK, linkTo, SIGN_IN_LINK } from "./email-links";
import { invitationEmail, magicLinkEmail } from "./email-message";
import {
  type EmailProviderConfig,
  emailRoutesOf,
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
 * through the one provider module, from the verified sender on
 * mail.<production host>: each email through Brevo by default, the sign-in
 * email through Resend with `--sign-in-provider resend` (delivery test 4,
 * EM-B6), and both through Resend with `--invite-provider resend` as well
 * (delivery test 5, EM-B9: "Run delivery test 5 with both emails via Resend
 * and report the invite's tab."). Production's routes (`emailRoutesOf`) are
 * built the same way, so only a pairing production can route is sent.
 *
 * Keys are read from the repo-root .env.local, one named key at a time (the
 * way prod-guard.ts reads PROD_NEON_ENDPOINT) and only the ones the sends
 * need (`deliveryKeysOf`): BREVO_API_KEY while either email goes through
 * Brevo, RESEND_API_KEY (once, shared) while either goes through Resend.
 * Never printed: the output is, per send, the provider, the HTTP status and
 * the provider's message id.
 */

/** The Brevo key's name. Oleksii keeps it in .env.local; it is never committed or logged. */
export const DELIVERY_KEY_NAME = "BREVO_API_KEY";

/**
 * The Resend key's name, read only when `--sign-in-provider` or
 * `--invite-provider` is `resend`; never committed or logged. The same name
 * production reads (EM-B7).
 */
export const RESEND_DELIVERY_KEY_NAME = "RESEND_API_KEY";

/** Where either email may go in this test: production's two candidates (EM-B6, EM-B9). */
export const DELIVERY_PROVIDERS = ["brevo", "resend"] as const;
export type DeliveryProvider = (typeof DELIVERY_PROVIDERS)[number];

/** Which provider each email goes through in one run. */
export type DeliveryRouting = { signIn: DeliveryProvider; invite: DeliveryProvider };

/** `--sign-in-provider` / `--invite-provider` as given, or null for anything that isn't one of the two. Unset is Brevo. */
export function deliveryProviderOf(value: string | undefined): DeliveryProvider | null {
  if (value === undefined) return "brevo";
  return (DELIVERY_PROVIDERS as readonly string[]).includes(value)
    ? (value as DeliveryProvider)
    : null;
}

/**
 * Why production could not route this pairing, or null when it can. The
 * invite is production's default route and only Resend has a key name of its
 * own (`PROVIDER_KEY_NAMES`), so sign-in through Brevo beside invites through
 * Resend has no configuration; sending it would test a routing that cannot
 * ship.
 */
export function unroutableDeliveryOf(routing: DeliveryRouting): string | null {
  return routing.invite === "resend" && routing.signIn === "brevo"
    ? "--invite-provider resend needs --sign-in-provider resend (production cannot send sign-in through Brevo while invites go through Resend)"
    : null;
}

/** Which keys a run sends with: Brevo's while either email goes through Brevo, Resend's while either goes through Resend. */
export function deliveryKeysNeeded(routing: DeliveryRouting): { brevo: boolean; resend: boolean } {
  const providers = [routing.signIn, routing.invite];
  return { brevo: providers.includes("brevo"), resend: providers.includes("resend") };
}

/**
 * Reads exactly the keys `deliveryKeysNeeded` names, each at most once
 * (`readKey` is the script's `readSingleKey` on .env.local): a run never
 * touches a key it doesn't send with, and both emails on Resend share one
 * read of RESEND_API_KEY.
 */
export function deliveryKeysOf(
  routing: DeliveryRouting,
  readKey: (name: string) => string | undefined,
): { apiKey: string | undefined; resendApiKey: string | undefined } {
  const needed = deliveryKeysNeeded(routing);
  return {
    apiKey: needed.brevo ? readKey(DELIVERY_KEY_NAME) : undefined,
    resendApiKey: needed.resend ? readKey(RESEND_DELIVERY_KEY_NAME) : undefined,
  };
}

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
  /** BREVO_API_KEY, read by the script only while either email goes through Brevo. */
  apiKey: string | undefined;
  /** Where the sign-in email goes (`--sign-in-provider`); unset is Brevo. */
  signInProvider?: DeliveryProvider;
  /** Where the invite goes (`--invite-provider`); unset is Brevo. */
  inviteProvider?: DeliveryProvider;
  /** RESEND_API_KEY, read by the script only while either email goes through Resend. */
  resendApiKey?: string | undefined;
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
  const routing: DeliveryRouting = {
    signIn: input.signInProvider ?? "brevo",
    invite: input.inviteProvider ?? "brevo",
  };
  const unroutable = unroutableDeliveryOf(routing);
  if (unroutable !== null) {
    input.log(`${unroutable}. Nothing sent.`);
    return 1;
  }
  const needed = deliveryKeysNeeded(routing);
  if (needed.brevo && !input.apiKey) {
    input.log(`${DELIVERY_KEY_NAME} is not set in the repo-root .env.local. Nothing sent.`);
    return 1;
  }
  if (needed.resend && !input.resendApiKey) {
    input.log(`${RESEND_DELIVERY_KEY_NAME} is not set in the repo-root .env.local. Nothing sent.`);
    return 1;
  }
  const originHost = (() => {
    try {
      return new URL(input.origin).host;
    } catch {
      return "";
    }
  })();
  // Production's own routing (`emailRoutesOf`), so the test sends the way
  // the app will: one From, From name and Reply-To for both emails. The
  // invite is the default route; with it on Resend, sign-in on Resend IS the
  // default route (same provider, same key), as production reads it.
  const routes = emailRoutesOf({
    EMAIL_PROVIDER: routing.invite,
    EMAIL_PROVIDER_API_KEY: routing.invite === "resend" ? input.resendApiKey : input.apiKey,
    ...(routing.signIn === "resend"
      ? { EMAIL_SIGN_IN_PROVIDER: "resend", RESEND_API_KEY: input.resendApiKey }
      : {}),
    EMAIL_FROM_ADDRESS: `${FROM_LOCAL_PART}@mail.${originHost}`,
    EMAIL_FROM_NAME: input.fromName,
    EMAIL_REPLY_TO: input.replyTo,
    PRODUCTION_ORIGIN: input.origin,
  });
  if (routes.kind !== "configured") {
    const why = routes.kind === "missing" ? `missing ${routes.missing.join(", ")}` : routes.reason;
    input.log(`Not configured: ${why}. Nothing sent.`);
    return 1;
  }
  const operatorName = operatorDisplayName({ KABINET_OPERATOR_DISPLAY_NAME: input.operatorName });
  const testLink = (target: { path: string; param: string }) =>
    linkTo(input.base, target, `TEST-${input.random()}`);
  // The real builders and the real TTLs: what a shelter would receive, with
  // test links and a fictional shelter in place of real ones.
  const sends: { label: string; route: EmailProviderConfig; email: OutgoingEmail }[] = [
    {
      label: "magic link",
      route: routes.routes.signIn,
      email: magicLinkEmail({
        to: input.to,
        url: testLink(SIGN_IN_LINK),
        ttlMinutes: MAGIC_LINK_TTL_SECONDS / 60,
        operatorName,
      }),
    },
    {
      label: "invite",
      route: routes.routes.invite,
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
    const provider = send.route.provider;
    try {
      const sent: SentEmail = await fetchEmailSender(send.route, input.fetchImpl).send(send.email);
      input.log(
        `${send.label}: ${provider}, status ${sent.status}, message id ${sent.messageId ?? "(none given)"}`,
      );
    } catch (error) {
      // The module's own error names the provider and status only.
      input.log(`${send.label}: ${provider}, FAILED (${(error as Error).message})`);
      failed = true;
    }
  }
  return failed ? 1 : 0;
}
