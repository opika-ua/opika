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
  PROVIDER_KEY_NAMES,
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
 * mail.<production host>, both through Resend, as production sends them
 * since delivery test 5 (Oleksii, 2026-10-15, EM-B10, verbatim: "Decision:
 * invites move to Resend; retire Brevo."). Production's routes
 * (`emailRoutesOf`) are built from the same variables, so the test sends
 * exactly what production could be configured for: since PW1-Q4 that is
 * Resend only, and `--sign-in-provider brevo` / `--invite-provider brevo`
 * are refused by name (`deliveryLockRefusalOf`) before any key is read. The
 * flags, `brevo` among their values and the Brevo key's reading stay until
 * Brevo's removal (after the 14 Nov check), which deletes them.
 *
 * Tracking is checked by hand, not by the script (PW1-Q5): it sends with a
 * sending-only key, which can't read Resend's domain settings. Oleksii,
 * 2026-10-20, verbatim: "PW1-Q5: (b). Keep a sending-only key and drop the
 * domain-reading check from the script. Tracking stays verified by hand: the
 * Resend dashboard shows click and open tracking off, and the links in the
 * received email are plain. Add both as runbook steps for each delivery
 * test." (`docs/onboarding-a-shelter.md`, "Every delivery test".)
 *
 * Keys are read from the repo-root .env.local, one named key at a time (the
 * way prod-guard.ts reads PROD_NEON_ENDPOINT) and only the ones the sends
 * need (`deliveryKeysOf`): RESEND_API_KEY, once, shared by both emails.
 * Never printed: the output is, per send, the provider, the HTTP status and
 * the provider's message id.
 */

/** The Brevo key's name, production's (`PROVIDER_KEY_NAMES`); never committed or logged. */
export const DELIVERY_KEY_NAME = PROVIDER_KEY_NAMES.brevo;

/** The Resend key's name, production's (`PROVIDER_KEY_NAMES`, EM-B7); never committed or logged. */
export const RESEND_DELIVERY_KEY_NAME = PROVIDER_KEY_NAMES.resend;

/**
 * What `--sign-in-provider` / `--invite-provider` parse: Resend, production's, and `brevo`,
 * which parses only to be refused by name (`deliveryLockRefusalOf`, PW1-Q4) rather than read
 * as a typo. Brevo's removal deletes it.
 */
export const DELIVERY_PROVIDERS = ["resend", "brevo"] as const;
export type DeliveryProvider = (typeof DELIVERY_PROVIDERS)[number];

/** Which provider each email goes through in one run. */
export type DeliveryRouting = { signIn: DeliveryProvider; invite: DeliveryProvider };

/**
 * The refusal for a run asking for Brevo, or null. Every email this test sends is an auth email,
 * and config locks those to Resend (Oleksii, 2026-10-20, inbox PW1-Q4, verbatim: "PW1-Q4: (a).
 * Lock auth emails (sign-in, invite, reset, password changed) to Resend in config, with a test
 * that a Brevo setting is refused for them."). `emailRoutesOf` would refuse the routes anyway;
 * this names the lock and the flag, and lets the script refuse before it reads any key.
 */
export function deliveryLockRefusalOf(routing: DeliveryRouting): string | null {
  const flags = [
    routing.signIn === "brevo" ? "--sign-in-provider brevo" : null,
    routing.invite === "brevo" ? "--invite-provider brevo" : null,
  ].filter((flag) => flag !== null);
  if (flags.length === 0) return null;
  return `${flags.join(" and ")}: refused. Auth emails are locked to Resend (PW1-Q4), so neither email may go through Brevo. Nothing sent.`;
}

/** `--sign-in-provider` / `--invite-provider` as given, or null for anything that isn't one of the two. Unset is Resend. */
export function deliveryProviderOf(value: string | undefined): DeliveryProvider | null {
  if (value === undefined) return "resend";
  return (DELIVERY_PROVIDERS as readonly string[]).includes(value)
    ? (value as DeliveryProvider)
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
): { brevoApiKey: string | undefined; resendApiKey: string | undefined } {
  const needed = deliveryKeysNeeded(routing);
  return {
    brevoApiKey: needed.brevo ? readKey(DELIVERY_KEY_NAME) : undefined,
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
  /** BREVO_API_KEY: never read since PW1-Q4, a Brevo run being refused first; goes with Brevo's removal. */
  brevoApiKey?: string | undefined;
  /** Where the sign-in email goes (`--sign-in-provider`); unset is Resend, `brevo` is refused (PW1-Q4). */
  signInProvider?: DeliveryProvider;
  /** Where the invite goes (`--invite-provider`); unset is Resend, `brevo` is refused (PW1-Q4). */
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
  /** Both emails sign with this (`- {operator}`): app config, never a literal; unset, the catalogue fallback. */
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
  const routing: DeliveryRouting = {
    signIn: input.signInProvider ?? "resend",
    invite: input.inviteProvider ?? "resend",
  };
  const locked = deliveryLockRefusalOf(routing);
  if (locked !== null) {
    input.log(locked);
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
  const needed = deliveryKeysNeeded(routing);
  if (needed.brevo && !input.brevoApiKey) {
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
  // Production's own routing (`emailRoutesOf`), from the variables
  // production reads, so the test sends the way the app will: one From, From
  // name and Reply-To for both emails, on Resend's key (the config refuses
  // any other provider, PW1-Q4). The invite is the default route; sign-in
  // names its provider only when it differs, as production leaves
  // EMAIL_SIGN_IN_PROVIDER unset. A key the run doesn't need was never read,
  // so it is undefined.
  const routes = emailRoutesOf({
    EMAIL_PROVIDER: routing.invite,
    ...(routing.signIn === routing.invite ? {} : { EMAIL_SIGN_IN_PROVIDER: routing.signIn }),
    [PROVIDER_KEY_NAMES.resend]: input.resendApiKey,
    [PROVIDER_KEY_NAMES.brevo]: input.brevoApiKey,
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
        // The first invite, the one every shelter gets at create, is the before-verification one (Q-C).
        shelterVerification: "not_yet_verified",
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
