/**
 * The one module that sends email (IN-Q2, Oleksii: "Call the provider HTTP
 * API with fetch, no SDK, behind one module."). Which provider is still
 * open: HS-Q2 picks it by a real delivery test to Gmail, ukr.net and i.ua.
 * So the three candidates sit behind one interface and config chooses.
 * Their request shapes follow each provider's public API reference
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

export interface EmailSender {
  send(email: OutgoingEmail): Promise<void>;
}

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
): EmailSender {
  return {
    async send(email) {
      const { url, init } = providerRequest(config, email);
      let response: Response;
      try {
        response = await fetchImpl(url, {
          ...init,
          signal: AbortSignal.timeout(EMAIL_SEND_TIMEOUT_MS),
        });
      } catch {
        throw new Error(`Email provider ${config.provider} did not answer the send.`);
      }
      const body = (await response.json().catch(() => null)) as { ErrorCode?: number } | null;
      // Postmark reports failures inside a 2xx, and one it can't be read as
      // success either (review of 3bc08a0, finding 6: a non-JSON 200).
      const postmarkError =
        config.provider === "postmark" && (body === null || (body.ErrorCode ?? 0) !== 0);
      if (!response.ok || postmarkError) {
        throw new Error(
          `Email provider ${config.provider} refused the send (status ${response.status}).`,
        );
      }
    },
  };
}
