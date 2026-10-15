import type { EMAIL_BLOCK_REASONS } from "@opika/contracts";

/**
 * The one module that sends email (IN-Q2, Oleksii: "Call the provider HTTP
 * API with fetch, no SDK, behind one module."). Production sends invites
 * through Brevo (IN-E2, 2026-10-13) and sign-in emails through Resend
 * (Oleksii, 2026-10-15, inbox EM-B6, verbatim: "EM-R1 has fired: move sign-in
 * sends to Resend (see item 2). Invites stay on Brevo while they land in
 * Primary."), each a route (`emailRoutesOf`). All three providers stay behind
 * one interface and config chooses, so a swap is an env change. Their request shapes follow each provider's public API reference
 * (2026-10-13):
 *
 * - Resend: `POST https://api.resend.com/emails`, `Authorization: Bearer`,
 *   `{ from, to, reply_to, subject, html, text }`, 200 `{ id }`.
 * - Postmark: `POST https://api.postmarkapp.com/email`,
 *   `X-Postmark-Server-Token`, `{ From, To, ReplyTo, Subject, HtmlBody,
 *   TextBody, MessageStream }`. Errors may come back as a 2xx with a non-zero
 *   `ErrorCode`, so the body is checked, not only the status.
 * - Brevo: `POST https://api.brevo.com/v3/smtp/email`, `api-key`,
 *   `{ sender: { email, name }, to: [{ email }], replyTo: { email }, subject,
 *   htmlContent, textContent }`, 201 `{ messageId }`.
 *
 * Every email carries a Reply-To (Oleksii, 2026-10-14, verbatim: "5. Yes:
 * Reply-To: hello@opika.org.ua on all emails."): the From address is a
 * no-reply on the sending subdomain, and a volunteer who answers a sign-in or
 * invite email must reach a person. The address is config (`EMAIL_REPLY_TO`),
 * never a literal here.
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
  /** Where a reply goes (`EMAIL_REPLY_TO`): a person's inbox on PRODUCTION_ORIGIN's host, never the no-reply sender. */
  replyTo: string;
};

export type OutgoingEmail = { to: string; subject: string; html: string; text: string };

export type EmailConfigResult =
  | { kind: "configured"; config: EmailProviderConfig }
  | { kind: "missing"; missing: readonly string[] }
  | { kind: "invalid"; reason: string };

/**
 * Reads `EMAIL_PROVIDER`, `EMAIL_PROVIDER_API_KEY`, `EMAIL_FROM_ADDRESS`,
 * `EMAIL_REPLY_TO`, `PRODUCTION_ORIGIN` and the optional `EMAIL_FROM_NAME`.
 * The From address's domain must be exactly `mail.` + PRODUCTION_ORIGIN's
 * host (review of 3bc08a0, finding 4: a bare "starts with mail." accepted
 * `a@mail.attacker.example`). The Reply-To must be on PRODUCTION_ORIGIN's own
 * host: a reply leaving for another domain is a phishing pattern, and the
 * address Oleksii named (hello@ on the apex) is exactly that host. Required,
 * not optional, so sign-in can't go live sending mail nobody can answer.
 */
export function emailProviderConfigOf(
  env: Readonly<Record<string, string | undefined>>,
): EmailConfigResult {
  const missing = [
    "EMAIL_PROVIDER",
    "EMAIL_PROVIDER_API_KEY",
    "EMAIL_FROM_ADDRESS",
    "EMAIL_REPLY_TO",
    "PRODUCTION_ORIGIN",
  ].filter((name) => !env[name]?.trim());
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
  const replyTo = replyToAddressOf(env.EMAIL_REPLY_TO, origin.host);
  if (replyTo === null) {
    return {
      kind: "invalid",
      reason: "EMAIL_REPLY_TO must be an address on PRODUCTION_ORIGIN's host",
    };
  }
  return {
    kind: "configured",
    config: {
      provider: provider as EmailProvider,
      apiKey: env.EMAIL_PROVIDER_API_KEY as string,
      fromAddress,
      fromName: env.EMAIL_FROM_NAME?.trim() || null,
      replyTo,
    },
  };
}

/**
 * The two routes production mail takes: one provider config per template.
 * `invite` is also the registry's block-list view (`cachedBlockList`); the
 * wiring commit hands `signIn` to `providerMagicLinkSender` and `invite` to
 * the invitation sender and `cachedBlockList` (`docs/h2-next-prs.md`). The
 * From address, From name and Reply-To are one set, validated once, so the
 * two emails can never come from different senders.
 */
export type EmailRoutes = { invite: EmailProviderConfig; signIn: EmailProviderConfig };

export type EmailRoutesResult =
  | { kind: "configured"; routes: EmailRoutes }
  | { kind: "missing"; missing: readonly string[] }
  | { kind: "invalid"; reason: string };

/**
 * Where a route that names its provider reads that provider's key: a key name
 * per provider (Oleksii, 2026-10-15, inbox EM-B7, verbatim: "Variable name:
 * go with RESEND_API_KEY. ... provider-specific key names match the Brevo
 * key's convention; a key only works with its own provider; provider
 * selection stays in its own setting. If invites move to Resend later, they
 * use the same RESEND_API_KEY."). Only Resend has one so far; the default
 * route still reads the generic `EMAIL_PROVIDER_API_KEY` (the asymmetry is
 * follow-up EM-F4, not renamed here).
 */
export const PROVIDER_KEY_NAMES: Readonly<Partial<Record<EmailProvider, string>>> = {
  resend: "RESEND_API_KEY",
};

/**
 * The default route (`emailProviderConfigOf`) plus an optional sign-in route
 * chosen by `EMAIL_SIGN_IN_PROVIDER` (EM-B6; the design is EM-T22, the key
 * name EM-B7). Per template rather than one switch, because one switch would
 * also move invites, which land in Primary on Brevo (EM-B4).
 *
 * - Unset: sign-in takes the default route. A provider key set on its own
 *   (`RESEND_API_KEY` is in Vercel Production before the wiring commit) moves
 *   nothing: selection is `EMAIL_SIGN_IN_PROVIDER`'s alone.
 * - The default route's own provider: the default route, the same provider
 *   and the same key (`EMAIL_PROVIDER_API_KEY`); its own key name, if set, is
 *   not read.
 * - Another provider: its own key (`PROVIDER_KEY_NAMES`, e.g.
 *   `RESEND_API_KEY`), with the default route's From, From name and Reply-To.
 *   That key missing, a provider with no key name of its own, or a value that
 *   isn't one of EMAIL_PROVIDERS: `invalid`, so production sign-in stays off
 *   (`provider_invalid`). Never a silent fall back to the default route: a
 *   half-done switch would keep sending sign-in through the route Oleksii
 *   moved it off, and nobody would see it.
 *
 * Checked before the default route, so a half-done switch is named as such
 * even when the default route is missing too. No reason ever carries a value
 * from the environment: a key pasted into the provider variable must not
 * reach a log.
 */
export function emailRoutesOf(
  env: Readonly<Record<string, string | undefined>>,
): EmailRoutesResult {
  const chosen = env.EMAIL_SIGN_IN_PROVIDER?.trim() ?? "";
  if (chosen !== "" && !(EMAIL_PROVIDERS as readonly string[]).includes(chosen)) {
    return {
      kind: "invalid",
      reason: `EMAIL_SIGN_IN_PROVIDER must be one of ${EMAIL_PROVIDERS.join(", ")}`,
    };
  }
  const signInProvider = chosen === "" ? null : (chosen as EmailProvider);
  // Naming the default route's own provider IS the default route: same
  // provider, same key. Only a different provider reads a key of its own,
  // otherwise resend+resend would need RESEND_API_KEY and then send invite and
  // sign-in on two different keys (review of the Resend route, finding 1).
  const ownsRoute = signInProvider !== null && signInProvider !== env.EMAIL_PROVIDER?.trim();
  const keyName = ownsRoute ? PROVIDER_KEY_NAMES[signInProvider] : undefined;
  if (ownsRoute && keyName === undefined) {
    return {
      kind: "invalid",
      reason:
        "EMAIL_SIGN_IN_PROVIDER names a provider with no key variable of its own " +
        `(only ${Object.values(PROVIDER_KEY_NAMES).join(", ")} exist)`,
    };
  }
  const signInKey = keyName === undefined ? "" : (env[keyName]?.trim() ?? "");
  if (keyName !== undefined && signInKey === "") {
    return {
      kind: "invalid",
      reason: `EMAIL_SIGN_IN_PROVIDER=${signInProvider} needs ${keyName}`,
    };
  }
  const base = emailProviderConfigOf(env);
  if (base.kind !== "configured") return base;
  const signIn: EmailProviderConfig =
    !ownsRoute || keyName === undefined
      ? base.config
      : { ...base.config, provider: signInProvider, apiKey: signInKey };
  return { kind: "configured", routes: { invite: base.config, signIn } };
}

/**
 * `EMAIL_REPLY_TO` as an address, or null: one `@`, no whitespace, and (when
 * `host` is given) a domain that is exactly that host. The sign-in card's
 * fallback line names the same address (IN-T9), so the person who can't find
 * an email and the person who replies to one reach the same inbox.
 */
export function replyToAddressOf(value: string | undefined, host?: string): string | null {
  const address = value?.trim() ?? "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) return null;
  const domain = (address.split("@")[1] ?? "").toLowerCase();
  if (host !== undefined && domain !== host) return null;
  return address;
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
          {
            from,
            to: [email.to],
            reply_to: config.replyTo,
            subject: email.subject,
            html: email.html,
            text: email.text,
          },
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
            ReplyTo: config.replyTo,
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
            replyTo: { email: config.replyTo },
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
  /**
   * Not knowable. The email is still sent (IN-E11), and the caller reports
   * `sent` with `blockCheck: "unknown"` (`EmailSendOutcome`), never a bare
   * `sent` that would read as "checked and clear".
   *
   * `provider_suppresses`: Resend. It keeps an account-level suppression list
   * (hard bounces, complaints, manual) and does not deliver to an address on
   * it (resend.com/docs/dashboard/emails/email-suppressions), but this module
   * doesn't read that list yet: its API pages the whole list with no lookup
   * by address, and may need a full-access key, a bigger secret than the
   * sending-only one (Oleksii, 2026-10-15, verbatim: "Resend sends show the
   * block-list check as "not checked" for now; scanning Resend's suppression
   * list is a follow-up."). Its own reason, so the log line says what is
   * true: the provider filters, and we didn't look.
   */
  | {
      kind: "unknown";
      why:
        | "unsupported_provider"
        | "provider_suppresses"
        | "provider_error"
        | "list_too_long"
        | "timed_out";
    };

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
/**
 * One deadline for the whole lookup, every page included (review of 5f9e7c4,
 * finding 2). A per-page timeout let five slow pages plus the send take about
 * a minute, inside the operator's request or, for sign-in, inside `after()`,
 * which counts against the function's duration. Brevo answers a page in well
 * under a second when healthy, so five seconds covers all five pages with
 * room; past it the answer is `unknown` (`timed_out`) and the email still goes,
 * reported as unchecked. Worst case per send: this plus EMAIL_SEND_TIMEOUT_MS.
 */
export const BLOCKED_LOOKUP_DEADLINE_MS = 5_000;

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
 * What one read of Brevo's block list found, up to the page cap. Shared by
 * the per-send check (`blockedStatusOf`) and the registry's list
 * (`cachedBlockList`), so both read the list the same way.
 *
 * - `complete`: the whole list was read (or the read stopped early because
 *   the caller found what it was looking for); `entries` is everything seen.
 * - `incomplete`: the cap was reached with more of the list unread. `entries`
 *   holds what was seen, and is never to be read as "nobody else is blocked".
 * - `unknown`: the list couldn't be read at all.
 */
export type BlockListScan =
  | { kind: "complete"; entries: ReadonlyMap<string, BlockReason> }
  | { kind: "incomplete"; entries: ReadonlyMap<string, BlockReason>; pagesRead: number }
  | { kind: "unknown"; why: "provider_error" | "timed_out" };

/**
 * Pages through Brevo's block list under one deadline, at most
 * BLOCKED_MAX_PAGES pages. Addresses are keyed lowercased. `stopWhen` lets a
 * caller looking for one address stop at the page that holds it.
 */
async function scanBrevoBlockList(
  config: EmailProviderConfig,
  fetchImpl: typeof fetch,
  deadline: AbortSignal,
  stopWhen: (entries: ReadonlyMap<string, BlockReason>) => boolean = () => false,
): Promise<BlockListScan> {
  const timedOut: BlockListScan = { kind: "unknown", why: "timed_out" };
  const entries = new Map<string, BlockReason>();
  for (let page = 0; page < BLOCKED_MAX_PAGES; page++) {
    if (deadline.aborted) return timedOut;
    const { url, init } = brevoBlockedContactsRequest(config, page * BLOCKED_PAGE_SIZE);
    let body: BrevoBlockedPage | null;
    try {
      const response = await fetchImpl(url, { ...init, signal: deadline });
      if (!response.ok) return { kind: "unknown", why: "provider_error" };
      body = (await response.json().catch(() => null)) as BrevoBlockedPage | null;
    } catch {
      return deadline.aborted ? timedOut : { kind: "unknown", why: "provider_error" };
    }
    if (body === null || !Array.isArray(body.contacts)) {
      // A body cut off by the deadline is a timeout, not a provider fault.
      return deadline.aborted ? timedOut : { kind: "unknown", why: "provider_error" };
    }
    for (const contact of body.contacts) {
      if (typeof contact.email !== "string") continue;
      const key = contact.email.toLowerCase();
      if (entries.has(key)) continue;
      const code = typeof contact.reason?.code === "string" ? contact.reason.code : "";
      entries.set(key, BREVO_REASONS[code] ?? "admin_blocked");
    }
    if (stopWhen(entries)) return { kind: "complete", entries };
    const seen = page * BLOCKED_PAGE_SIZE + body.contacts.length;
    const total = typeof body.count === "number" ? body.count : seen;
    if (body.contacts.length < BLOCKED_PAGE_SIZE || seen >= total) {
      return { kind: "complete", entries };
    }
  }
  return { kind: "incomplete", entries, pagesRead: BLOCKED_MAX_PAGES };
}

/** Runs `scan` under one deadline of `deadlineMs`, cleared however it ends. */
async function withDeadline<T>(
  deadlineMs: number,
  scan: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), deadlineMs);
  try {
    return await scan(deadline.signal);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Whether the provider will refuse to deliver to `address`. Brevo only; any
 * other provider answers `unknown` (Resend as `provider_suppresses`, above). Every failure (timeout, non-2xx, a body
 * that isn't the documented shape) is `unknown`, and never names the key or
 * the address. All pages share one deadline, BLOCKED_LOOKUP_DEADLINE_MS from
 * the first request: a `setTimeout`, not `AbortSignal.timeout`, so a test can
 * cross it with fake timers instead of waiting five seconds.
 */
export async function blockedStatusOf(
  config: EmailProviderConfig,
  address: string,
  fetchImpl: typeof fetch = fetch,
  deadlineMs: number = BLOCKED_LOOKUP_DEADLINE_MS,
): Promise<BlockedStatus> {
  if (config.provider === "resend") return { kind: "unknown", why: "provider_suppresses" };
  if (config.provider !== "brevo") return { kind: "unknown", why: "unsupported_provider" };
  const wanted = address.trim().toLowerCase();
  const scan = await withDeadline(deadlineMs, (signal) =>
    scanBrevoBlockList(config, fetchImpl, signal, (entries) => entries.has(wanted)),
  );
  if (scan.kind === "unknown") return scan;
  const reason = scan.entries.get(wanted);
  if (reason !== undefined) return { kind: "blocked", reason };
  return scan.kind === "complete"
    ? { kind: "not_blocked" }
    : { kind: "unknown", why: "list_too_long" };
}

// ─── The registry's view of the block list (Oleksii, 2026-10-14, answer 4) ──

/**
 * How long one read of the whole block list is reused. Oleksii, verbatim:
 * "Cache the Brevo blocked list for a few minutes." Three: long enough that
 * an operator reloading S4 or moving between shelters doesn't page through
 * Brevo each time, short enough that an address unblocked by hand in Brevo
 * reads as clear a few minutes later. Only readable answers are kept; an
 * `unknown` is never cached, so the next load asks again.
 */
export const BLOCK_LIST_CACHE_MS = 3 * 60_000;

/** One read of the list as the registry sees it: when it was read, and what it found. */
export type BlockListSnapshot =
  | { kind: "complete"; readAt: Date; entries: ReadonlyMap<string, BlockReason> }
  | {
      kind: "incomplete";
      readAt: Date;
      entries: ReadonlyMap<string, BlockReason>;
      pagesRead: number;
    }
  | { kind: "unknown"; why: "provider_error" | "timed_out" | "unsupported_provider" };

export interface BlockListReader {
  /** The list as read at most `ttlMs` before `now`, or a fresh read. Never throws. */
  read(now: Date): Promise<BlockListSnapshot>;
}

/** A reader with nothing to read (development's console sender): always `unknown`, never "none blocked". */
export const unsupportedBlockList: BlockListReader = {
  read: async () => ({ kind: "unknown", why: "unsupported_provider" }),
};

/**
 * The whole block list, read once per BLOCK_LIST_CACHE_MS and shared by
 * every registry request in this process. Its rules are Oleksii's (verbatim:
 * "Cap the pages read; on hitting the cap, return a typed "incomplete"
 * result, not a partial "none blocked". If Brevo is unreachable or errors,
 * return a typed "unknown", never an empty list."):
 *
 * - the cap is BLOCKED_MAX_PAGES, the same as the per-send check;
 * - reaching it is `incomplete`, carrying what was seen;
 * - an error, a timeout or a non-Brevo provider is `unknown`, with no list.
 *
 * The clock is the caller's `now`, so the expiry is tested without waiting. A
 * cached read stamped in the future (a clock that moved back) is not trusted.
 * Reads that arrive while one is in flight share it rather than each paging
 * through Brevo.
 */
export function cachedBlockList(
  config: EmailProviderConfig,
  options: { fetchImpl?: typeof fetch; ttlMs?: number; deadlineMs?: number } = {},
): BlockListReader {
  if (config.provider !== "brevo") return unsupportedBlockList;
  const ttlMs = options.ttlMs ?? BLOCK_LIST_CACHE_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  let cached: Exclude<BlockListSnapshot, { kind: "unknown" }> | null = null;
  let inFlight: Promise<BlockListSnapshot> | null = null;
  const fresh = (now: Date) => {
    if (cached === null) return null;
    const age = now.getTime() - cached.readAt.getTime();
    return age >= 0 && age < ttlMs ? cached : null;
  };
  return {
    async read(now) {
      const hit = fresh(now);
      if (hit !== null) return hit;
      inFlight ??= (async (): Promise<BlockListSnapshot> => {
        try {
          const scan = await withDeadline(
            options.deadlineMs ?? BLOCKED_LOOKUP_DEADLINE_MS,
            (signal) => scanBrevoBlockList(config, fetchImpl, signal),
          );
          if (scan.kind === "unknown") return scan;
          cached = { ...scan, readAt: now };
          return cached;
        } catch {
          return { kind: "unknown", why: "provider_error" };
        } finally {
          inFlight = null;
        }
      })();
      return inFlight;
    },
  };
}
