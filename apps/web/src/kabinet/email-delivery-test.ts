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
 * mail.<production host>: both through Resend by default, as production
 * sends them since delivery test 5 (Oleksii, 2026-10-15, EM-B10, verbatim:
 * "Decision: invites move to Resend; retire Brevo."). Either email can still
 * go through Brevo (`--sign-in-provider brevo`, `--invite-provider brevo`)
 * for comparison during Brevo's 30-day grace period; that choice goes when
 * Brevo's code does (a retirement step, with his OK). Production's routes
 * (`emailRoutesOf`) are built from the same variables, each provider on its
 * own key, so every pairing is one production could be configured for.
 *
 * Keys are read from the repo-root .env.local, one named key at a time (the
 * way prod-guard.ts reads PROD_NEON_ENDPOINT) and only the ones the sends
 * need (`deliveryKeysOf`): RESEND_API_KEY (once, shared) while either email
 * goes through Resend, BREVO_API_KEY only while one is asked to go through
 * Brevo. Never printed: the output is, per send, the provider, the HTTP
 * status and the provider's message id.
 */

/** The Brevo key's name, production's (`PROVIDER_KEY_NAMES`); never committed or logged. */
export const DELIVERY_KEY_NAME = PROVIDER_KEY_NAMES.brevo;

/** The Resend key's name, production's (`PROVIDER_KEY_NAMES`, EM-B7); never committed or logged. */
export const RESEND_DELIVERY_KEY_NAME = PROVIDER_KEY_NAMES.resend;

/** Where either email may go in this test: Resend, production's, and Brevo while its grace period lasts (EM-B10). */
export const DELIVERY_PROVIDERS = ["resend", "brevo"] as const;
export type DeliveryProvider = (typeof DELIVERY_PROVIDERS)[number];

/** Which provider each email goes through in one run. */
export type DeliveryRouting = { signIn: DeliveryProvider; invite: DeliveryProvider };

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
  /** BREVO_API_KEY, read by the script only while either email goes through Brevo. */
  brevoApiKey?: string | undefined;
  /** Where the sign-in email goes (`--sign-in-provider`); unset is Resend. */
  signInProvider?: DeliveryProvider;
  /** Where the invite goes (`--invite-provider`); unset is Resend. */
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
    signIn: input.signInProvider ?? "resend",
    invite: input.inviteProvider ?? "resend",
  };
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
  // name and Reply-To for both emails, each provider on its own key. The
  // invite is the default route; sign-in names its provider only when it
  // differs, as production leaves EMAIL_SIGN_IN_PROVIDER unset for one
  // provider. A key the run doesn't need was never read, so it is undefined.
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
  // Oleksii, 2026-10-19 (`docs/shelter-passwords.md` §9), verbatim: "Both #136 safeguards
  // approved: the exact-payload test ({from,to,reply_to,subject,html,text} only) and
  // delivery-test refusing if tracking is on." Resend's tracking is a setting of the sending
  // domain, never of a message, so it is read from the domain before anything is sent, and an
  // answer that can't be read refuses too (fail closed).
  if (routing.signIn === "resend" || routing.invite === "resend") {
    const tracking = await resendTrackingOf(
      input.resendApiKey ?? "",
      `mail.${originHost}`,
      input.fetchImpl ?? fetch,
    );
    if (tracking.kind !== "off") {
      input.log(`${trackingRefusal(tracking)} Nothing sent.`);
      return 1;
    }
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

/**
 * What Resend says about the sending domain's tracking. `off` only when the
 * domain is found and both switches read exactly `false`; anything else
 * (tracking on, the domain missing, a key that may not read domains, no
 * answer) refuses the test, since none of it shows tracking is off.
 */
export type ResendTracking =
  | { kind: "off" }
  | { kind: "on"; click: boolean; open: boolean }
  | { kind: "unknown"; why: "domain_not_found" | "not_readable" | "no_answer" };

/** Resend's domain endpoints (`GET /domains`, `GET /domains/{id}`), read with the same key as the sends. */
export async function resendTrackingOf(
  apiKey: string,
  domainName: string,
  fetchImpl: typeof fetch,
): Promise<ResendTracking> {
  const get = async (path: string): Promise<unknown | null> => {
    try {
      const response = await fetchImpl(`https://api.resend.com${path}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
          "User-Agent": "kabinet-mailer/1",
        },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) return undefined;
      return (await response.json().catch(() => undefined)) ?? undefined;
    } catch {
      return null;
    }
  };
  const list = await get("/domains?limit=100");
  if (list === null) return { kind: "unknown", why: "no_answer" };
  if (list === undefined) return { kind: "unknown", why: "not_readable" };
  const domains = (list as { data?: unknown }).data;
  const found = Array.isArray(domains)
    ? (domains as { id?: unknown; name?: unknown }[]).find(
        (domain) => typeof domain.name === "string" && domain.name.toLowerCase() === domainName,
      )
    : undefined;
  if (found === undefined || typeof found.id !== "string") {
    return { kind: "unknown", why: "domain_not_found" };
  }
  const domain = await get(`/domains/${encodeURIComponent(found.id)}`);
  if (domain === null) return { kind: "unknown", why: "no_answer" };
  if (domain === undefined) return { kind: "unknown", why: "not_readable" };
  const { click_tracking: click, open_tracking: open } = domain as {
    click_tracking?: unknown;
    open_tracking?: unknown;
  };
  if (click === false && open === false) return { kind: "off" };
  return { kind: "on", click: click !== false, open: open !== false };
}

/** The refusal's line: which switch is on, or why the answer couldn't be read. Never a key or an address. */
function trackingRefusal(tracking: Exclude<ResendTracking, { kind: "off" }>): string {
  if (tracking.kind === "on") {
    const which = [tracking.click ? "click" : null, tracking.open ? "open" : null]
      .filter((name) => name !== null)
      .join(" and ");
    return `Resend tracking is on for the sending domain (${which}): no auth email may be tracked. Turn it off in Resend (Domains, the sending subdomain).`;
  }
  const why = {
    domain_not_found: "the sending domain is not on this Resend account",
    not_readable: "the key can't read domains (a sending-only key? the check needs one that can)",
    no_answer: "Resend didn't answer",
  }[tracking.why];
  return `Couldn't confirm Resend tracking is off: ${why}.`;
}
