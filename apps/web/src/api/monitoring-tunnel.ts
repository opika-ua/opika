import { envelopeUrlOf, type ParsedDsn, parseDsn } from "../observability/dsn";
import { scrubEvent } from "../observability/scrub";
import { boundedBody } from "./bounded-body";
import type { RateLimiter } from "./rate-limit";
import { retryAfterSecondsOf } from "./retry-after";

/** One error's envelope is a few kB; a deep stack is still far below this. */
export const MONITORING_MAX_BODY_BYTES = 64 * 1024;
export const MONITORING_FORWARD_TIMEOUT_MS = 5000;
const ACCEPTED_TYPES = ["text/plain", "application/x-sentry-envelope"];
/** The only item kind forwarded: an error event. Transactions, replays, sessions, attachments and profiles are dropped. */
const FORWARDED_ITEM_TYPE = "event";

export type MonitoringTunnelDeps = {
  /** The configured `NEXT_PUBLIC_SENTRY_DSN`, raw; undefined or malformed means the tunnel is off. */
  dsn: string | undefined;
  /** HMAC'd address key (`ipRateLimitKey`), computed by the caller. */
  ipKey: string;
  limiter: RateLimiter;
  now: Date;
  forward: typeof fetch;
};

const opaque = () => new Response(null, { status: 204 });

/**
 * What /api/monitoring does, as a function the tests call with a real `Request`. Order: method,
 * DSN presence, content type, per-IP limit, size, then the envelope must name exactly our DSN's host
 * and project. What is forwarded is rebuilt, not passed on: our DSN in the header, error events
 * only, each scrubbed, sent by this server alone - no cookie, no client header, no address (there is
 * no `x-forwarded-for`; Sentry sees our server). The reply never says whether Sentry accepted it.
 */
export async function handleMonitoringTunnel(
  request: Request,
  deps: MonitoringTunnelDeps,
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
  }
  const dsn = parseDsn(deps.dsn);
  if (dsn === null) return new Response("Not Found", { status: 404 });

  const type = (request.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase();
  if (!ACCEPTED_TYPES.includes(type ?? "")) {
    return new Response("Unsupported Media Type", { status: 415 });
  }

  if (!(await deps.limiter.check(deps.ipKey, deps.now))) {
    return new Response("Too Many Requests", {
      status: 429,
      headers: { "Retry-After": String(retryAfterSecondsOf(deps.limiter, deps.ipKey, deps.now)) },
    });
  }

  const bounded = await boundedBody(request, MONITORING_MAX_BODY_BYTES);
  if (bounded === "too_large") return new Response("Payload Too Large", { status: 413 });

  const envelope = parseEnvelope(Buffer.from(await bounded.arrayBuffer()));
  if (envelope === null || !namesDsn(envelope.header.dsn, dsn)) {
    return new Response("Bad Request", { status: 400 });
  }

  const events = envelope.items
    .filter((item) => item.header.type === FORWARDED_ITEM_TYPE)
    .map((item) => scrubbedEventPayload(item.payload))
    .filter((payload): payload is string => payload !== null);
  if (events.length === 0) return opaque();

  const body = [
    JSON.stringify({
      event_id: envelope.header.event_id,
      sent_at: envelope.header.sent_at,
      dsn: deps.dsn?.trim(),
    }),
    ...events.flatMap((payload) => [
      JSON.stringify({ type: FORWARDED_ITEM_TYPE, length: Buffer.byteLength(payload) }),
      payload,
    ]),
  ].join("\n");

  try {
    // Body only: no credentials, and no header taken from the request.
    await deps.forward(envelopeUrlOf(dsn), {
      method: "POST",
      headers: { "content-type": "application/x-sentry-envelope" },
      body,
      signal: AbortSignal.timeout(MONITORING_FORWARD_TIMEOUT_MS),
      redirect: "error",
    });
  } catch {
    // Monitoring never reports its own failure to the page.
  }
  return opaque();
}

type EnvelopeItem = { header: Record<string, unknown>; payload: Buffer };
type ParsedEnvelope = { header: Record<string, unknown>; items: EnvelopeItem[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function jsonLine(bytes: Buffer): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(bytes.toString("utf8"));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const NEWLINE = 0x0a;

/** Header line, then pairs of item header and payload (`length` bytes, else to the next newline). */
function parseEnvelope(bytes: Buffer): ParsedEnvelope | null {
  let pos = bytes.indexOf(NEWLINE);
  const header = jsonLine(pos === -1 ? bytes : bytes.subarray(0, pos));
  if (header === null) return null;
  const items: EnvelopeItem[] = [];
  while (pos !== -1 && pos + 1 < bytes.length) {
    const headEnd = bytes.indexOf(NEWLINE, pos + 1);
    if (headEnd === -1) return null;
    const itemHeader = jsonLine(bytes.subarray(pos + 1, headEnd));
    if (itemHeader === null) return null;
    const declared = itemHeader.length;
    let end: number;
    if (typeof declared === "number" && Number.isInteger(declared) && declared >= 0) {
      end = headEnd + 1 + declared;
      if (end > bytes.length) return null;
    } else {
      const lineEnd = bytes.indexOf(NEWLINE, headEnd + 1);
      end = lineEnd === -1 ? bytes.length : lineEnd;
    }
    items.push({ header: itemHeader, payload: bytes.subarray(headEnd + 1, end) });
    if (end >= bytes.length) break;
    if (bytes[end] !== NEWLINE) return null;
    pos = end;
  }
  return { header, items };
}

/** Exact host and project of our own DSN; the key in the envelope is not compared, only where it points. */
function namesDsn(claimed: unknown, ours: ParsedDsn): boolean {
  if (typeof claimed !== "string") return false;
  const parsed = parseDsn(claimed);
  return parsed !== null && parsed.host === ours.host && parsed.projectId === ours.projectId;
}

function scrubbedEventPayload(payload: Buffer): string | null {
  const event = jsonLine(payload);
  return event === null ? null : JSON.stringify(scrubEvent(event));
}
