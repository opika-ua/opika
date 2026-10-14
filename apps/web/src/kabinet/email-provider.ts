import type { EMAIL_BLOCK_REASONS } from "@opika/contracts";

/**
 * The one module that sends email (IN-Q2, Oleksii: "Call the provider HTTP
 * API with fetch, no SDK, behind one module."). Production uses Brevo;
 * Resend is the documented fallback, not set up (IN-E2, 2026-10-13). All
 * three stay behind one interface and config chooses, so a swap is an env
 * change. Their request shapes follow each provider's public API reference
 * (2026-10-13):
 *
 * - Resend: `POST https://api.resend.com/emails`, `Authorization: Bearer`,
 *   `{ from, to, subject, html, text }`, 200 `{ id }`.
 * - Postmark: `POST https://api.postmarkapp.com/email`,
 *   `X-Postmark-Server-Token`, `{ From, To, Subject, HtmlBody, TextBody,
 *   MessageStream }`. Errors may come back as a 2xx with a non-zero
 *   `ErrorCode`, so the body is checked, not only the status.
 * - Brevo: `POST https://api.brevo.com/v3/smtp/email`, `api-key`,
 *   `{ sender: { email, name }, to: [{ email }], subject, htmlContent,
 *   textContent }`, 201 `{ messageId }`.
 *
 * Nothing here knows the product's name or domain: the From address comes
 * from env, and its domain must be `mail.` + the host of PRODUCTION_ORIGIN
 * (IN-R2, Oleksii: "The From address is on mail.opika.org.ua"; derived, never
 * a literal, because the name is not final).
 */

/** How long one send may take before it is abandoned (no retry: a send isn't idempotent). */
export const EMAIL_SEND_TIMEOUT_MS = 10_000;

/** Sent explicitly (Resend refuses requests without one); generic, no product name. */
const USER_AGENT = "kabinet-mailer/1";

export const EMAIL_PROVIDERS = ["resend", "postmark", "brevo"] as const;
export type EmailProvider = (typeof EMAIL_PROVIDERS)[number];

export type EmailProviderConfig = {
  provider: EmailProvider;
  apiKey: string;
  /** e.g. `kabinet@mail.<domain>`: the sending subdomain is `mail.` (IN-Q2). */
  fromAddress: string;
  /** Display name; from config, never a literal (the name is not final). */
  fromName: string | null;
};

export type OutgoingEmail = { to: string; subject: string; html: string; text: string };

export type EmailConfigResult =
  | { kind: "configured"; config: EmailProviderConfig }
  | { kind: "missing"; missing: readonly string[] }
  | { kind: "invalid"; reason: string };

/**
 * Reads `EMAIL_PROVIDER`, `EMAIL_PROVIDER_API_KEY`, `EMAIL_FROM_ADDRESS`,
 * `PRODUCTION_ORIGIN` and the optional `EMAIL_FROM_NAME`. The From
 * address's domain must be exactly `mail.` + PRODUCTION_ORIGIN's host
 * (review of 3bc08a0, finding 4: a bare "starts with mail." accepted
 * `a@mail.attacker.example`).
 */
export function emailProviderConfigOf(
  env: Readonly<Record<string, string | undefined>>,
): EmailConfigResult {
  const missing = [
    "EMAIL_PROVIDER",
    "EMAIL_PROVIDER_API_KEY",
    "EMAIL_FROM_ADDRESS",
    "PRODUCTION_ORIGIN",
  ].filter((name) => !env[name]);
  if (missing.length > 0) return { kind: "missing", missing };
  const provider = env.EMAIL_PROVIDER as string;
  if (!(EMAIL_PROVIDERS as readonly string[]).includes(provider)) {
    return {
      kind: "invalid",
      reason: `EMAIL_PROVIDER must be one of ${EMAIL_PROVIDERS.join(", ")}`,
    };
  }
  const origin = productionOriginOf(env.PRODUCTION_ORIGIN as string);
  if (origin === null) {
    return { kind: "invalid", reason: "PRODUCTION_ORIGIN must be an https origin with no path" };
  }
  const fromAddress = (env.EMAIL_FROM_ADDRESS as string).trim();
  const domain = (fromAddress.split("@")[1] ?? "").toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(fromAddress) || domain !== `mail.${origin.host}`) {
    return {
      kind: "invalid",
      reason: "EMAIL_FROM_ADDRESS must be an address on mail.<PRODUCTION_ORIGIN's host>",
    };
  }
  return {
    kind: "configured",
    config: {
      provider: provider as EmailProvider,
      apiKey: env.EMAIL_PROVIDER_API_KEY as string,
      fromAddress,
      fromName: env.EMAIL_FROM_NAME?.trim() || null,
    },
  };
}

/**
 * PRODUCTION_ORIGIN as a parsed https origin (`https://host`, nothing after
 * the host but an optional trailing slash), or null. Pinned explicitly, never
 * derived from the platform (IN-R2, Decision 2).
 */
export function productionOriginOf(value: string): { origin: string; host: string } | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  if ((url.pathname !== "/" && url.pathname !== "") || url.search || url.hash) return null;
  return { origin: url.origin, host: url.hostname.toLowerCase() };
}

/** The exact HTTP request for one email, per provider. Pure, so each shape is tested without a network. */
export function providerRequest(
  config: EmailProviderConfig,
  email: OutgoingEmail,
): { url: string; init: RequestInit } {
  const from =
    config.fromName === null ? config.fromAddress : `${config.fromName} <${config.fromAddress}>`;
  const json = (headers: Record<string, string>, body: unknown): RequestInit => ({
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": USER_AGENT,
      ...headers,
    },
    body: JSON.stringify(body),
  });
  switch (config.provider) {
    case "resend":
      return {
        url: "https://api.resend.com/emails",
        init: json(
          { Authorization: `Bearer ${config.apiKey}` },
          { from, to: [email.to], subject: email.subject, html: email.html, text: email.text },
        ),
      };
    case "postmark":
      return {
        url: "https://api.postmarkapp.com/email",
        init: json(
          { "X-Postmark-Server-Token": config.apiKey },
          {
            From: from,
            To: email.to,
            Subject: email.subject,
            HtmlBody: email.html,
            TextBody: email.text,
            MessageStream: "outbound",
          },
        ),
      };
    case "brevo":
      return {
        url: "https://api.brevo.com/v3/smtp/email",
        init: json(
          { "api-key": config.apiKey },
          {
            sender:
              config.fromName === null
                ? { email: config.fromAddress }
                : { email: config.fromAddress, name: config.fromName },
            to: [{ email: email.to }],
            subject: email.subject,
            htmlContent: email.html,
            textContent: email.text,
          },
        ),
      };
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled provider; unreachable at runtime */
    default: {
      const unreachable: never = config.provider;
      throw new Error(`Unhandled provider ${String(unreachable)}`);
    }
  }
}

/** What a successful send reports: the HTTP status and the provider's id for the message, if it gave one. */
export type SentEmail = { status: number; messageId: string | null };

export interface EmailSender {
  send(email: OutgoingEmail): Promise<SentEmail>;
}

/** Each provider names its message id differently: Resend `id`, Postmark `MessageID`, Brevo `messageId`. */
const messageIdOf = (body: Record<string, unknown> | null): string | null => {
  const id = body?.messageId ?? body?.MessageID ?? body?.id;
  return typeof id === "string" ? id : null;
};

/**
 * Sends through the configured provider. Throws on any failure, a 2xx
 * carrying an error included, with the provider and status only: never
 * the key, and never the recipient's address in the message. A send is
 * abandoned after EMAIL_SEND_TIMEOUT_MS and never retried (review of
 * 3bc08a0, finding 3): a hung provider must not hold a request open, and a
 * retry could send twice.
 */
export function fetchEmailSender(
  config: EmailProviderConfig,
  fetchImpl: typeof fetch = fetch,
  // Injectable only so a test can prove the abort really fires (review pass
  // 2, finding 1) without waiting ten seconds; production uses the default.
  timeoutMs: number = EMAIL_SEND_TIMEOUT_MS,
): EmailSender {
  return {
    async send(email) {
      const { url, init } = providerRequest(config, email);
      let response: Response;
      try {
        response = await fetchImpl(url, {
          ...init,
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        throw new Error(`Email provider ${config.provider} did not answer the send.`);
      }
      const body = (await response.json().catch(() => null)) as
        | (Record<string, unknown> & { ErrorCode?: number })
        | null;
      // Postmark reports failures inside a 2xx, and one it can't be read as
      // success either (review of 3bc08a0, finding 6: a non-JSON 200).
      const postmarkError =
        config.provider === "postmark" && (body === null || (body.ErrorCode ?? 0) !== 0);
      if (!response.ok || postmarkError) {
        throw new Error(
          `Email provider ${config.provider} refused the send (status ${response.status}).`,
        );
      }
      return { status: response.status, messageId: messageIdOf(body) };
    },
  };
}

// ─── Blocked status (IN-E7) ─────────────────────────────────────────────────

/**
 * Why a provider will not deliver to an address, in the provider's own
 * terms mapped onto ours. A recipient who taps Gmail's "Unsubscribe" on a
 * sign-in email lands on Brevo's transactional block list (IN-E7), and Brevo
 * cannot drop that header for us; a send to that address is then accepted
 * and silently not delivered (inferred, see IN-E7), so the only way to know
 * is to ask before sending.
 */
export type BlockReason = (typeof EMAIL_BLOCK_REASONS)[number];

export type BlockedStatus =
  | { kind: "not_blocked" }
  | { kind: "blocked"; reason: BlockReason }
  /** Not knowable: say so, never guess "not blocked" into "delivered". */
  | { kind: "unknown"; why: "unsupported_provider" | "provider_error" | "list_too_long" };

/**
 * Brevo's documented reason codes (`GET /v3/smtp/blockedContacts`,
 * developers.brevo.com/reference/get-transac-blocked-contacts). An unlisted
 * code still means blocked; it is reported as `admin_blocked`, the reason
 * that claims least about the recipient.
 */
const BREVO_REASONS: Readonly<Record<string, BlockReason>> = {
  unsubscribedViaEmail: "unsubscribed",
  unsubscribedViaApi: "unsubscribed",
  unsubscribedViaMA: "unsubscribed",
  hardBounce: "hard_bounce",
  contactFlaggedAsSpam: "spam_complaint",
  adminBlocked: "admin_blocked",
};

/** Brevo's maximum page size for this endpoint. */
export const BLOCKED_PAGE_SIZE = 100;
/**
 * The list has no filter by recipient, so it is paged through. Past this
 * many pages the answer is `unknown`, not a guess: at this registry's scale a
 * list that long is itself a finding (IN-E7).
 */
export const BLOCKED_MAX_PAGES = 5;

/** The exact request for one page of Brevo's block list. Pure, like `providerRequest`. */
export function brevoBlockedContactsRequest(
  config: EmailProviderConfig,
  offset: number,
): { url: string; init: RequestInit } {
  const query = new URLSearchParams({
    limit: String(BLOCKED_PAGE_SIZE),
    offset: String(offset),
    sort: "desc",
  });
  return {
    url: `https://api.brevo.com/v3/smtp/blockedContacts?${query}`,
    init: {
      method: "GET",
      headers: { Accept: "application/json", "User-Agent": USER_AGENT, "api-key": config.apiKey },
    },
  };
}

type BrevoBlockedPage = {
  count?: unknown;
  contacts?: { email?: unknown; reason?: { code?: unknown } }[];
};

/**
 * Whether the provider will refuse to deliver to `address`. Brevo only; any
 * other provider answers `unknown`. Every failure (timeout, non-2xx, a body
 * that isn't the documented shape) is `unknown`, and never names the key or
 * the address.
 */
export async function blockedStatusOf(
  config: EmailProviderConfig,
  address: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = EMAIL_SEND_TIMEOUT_MS,
): Promise<BlockedStatus> {
  if (config.provider !== "brevo") return { kind: "unknown", why: "unsupported_provider" };
  const wanted = address.trim().toLowerCase();
  for (let page = 0; page < BLOCKED_MAX_PAGES; page++) {
    const { url, init } = brevoBlockedContactsRequest(config, page * BLOCKED_PAGE_SIZE);
    let body: BrevoBlockedPage | null;
    try {
      const response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) return { kind: "unknown", why: "provider_error" };
      body = (await response.json().catch(() => null)) as BrevoBlockedPage | null;
    } catch {
      return { kind: "unknown", why: "provider_error" };
    }
    if (body === null || !Array.isArray(body.contacts)) {
      return { kind: "unknown", why: "provider_error" };
    }
    const hit = body.contacts.find(
      (contact) => typeof contact.email === "string" && contact.email.toLowerCase() === wanted,
    );
    if (hit !== undefined) {
      const code = typeof hit.reason?.code === "string" ? hit.reason.code : "";
      return { kind: "blocked", reason: BREVO_REASONS[code] ?? "admin_blocked" };
    }
    const seen = page * BLOCKED_PAGE_SIZE + body.contacts.length;
    const total = typeof body.count === "number" ? body.count : seen;
    if (body.contacts.length < BLOCKED_PAGE_SIZE || seen >= total) return { kind: "not_blocked" };
  }
  return { kind: "unknown", why: "list_too_long" };
}
