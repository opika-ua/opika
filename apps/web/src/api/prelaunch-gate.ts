import { timingSafeEqual } from "node:crypto";
import { requireEnv } from "./env";

/**
 * Pre-launch access gate. While `SITE_IS_PUBLICLY_DISCOVERABLE` is false,
 * nothing about this deploy is meant to be reachable by anyone who doesn't
 * already know that — see `docs/build-plan.md`'s "Before any route is
 * indexed" launch-gate section for what this is standing in for.
 *
 * 2026-09-13 — decided after ~100 req/min of sustained, unidentified
 * traffic burned 4.2 GB of Neon's 5 GB monthly transfer allowance against a
 * corpus of 220 fabricated animals, noindexed, with no outreach done.
 * `X-Robots-Tag: noindex, nofollow` was already on every response — this
 * traffic ignores what the site says, so a politeness signal cannot reach
 * it. A hard gate can.
 *
 * `__Host-` prefix in production, same reasoning as `session/cookie.ts`:
 * implies Secure, Path=/, no Domain — a subdomain attacker can't set or
 * read it, and it's only ever sent over HTTPS. Falls back to a
 * non-prefixed name locally, where `__Host-` cookies are silently dropped
 * over plain HTTP.
 */

const COOKIE_NAME_PROD = "__Host-prelaunch-gate";
const COOKIE_NAME_DEV = "prelaunch-gate";

/** The one query parameter that can open the gate and mint the cookie. */
export const PRELAUNCH_GATE_QUERY_PARAM = "gate";

export function cookieName(): string {
  return process.env.NODE_ENV === "production" ? COOKIE_NAME_PROD : COOKIE_NAME_DEV;
}

/**
 * The gate secret, read fresh per call rather than cached at module scope —
 * `requireEnv`'s own comment explains why: a top-level read would make this
 * a build-time requirement, since `next build` imports route modules
 * (`proxy.ts` among them) to collect page data.
 */
export function prelaunchGateSecret(): string {
  return requireEnv("PRELAUNCH_GATE_SECRET");
}

/**
 * Same intent as `session/token.ts`'s `hashesEqual`, but checked on *byte*
 * length, not string `.length` — `hashesEqual` compares fixed-length hex
 * digests, always ASCII, where the two never diverge. This compares an
 * arbitrary caller-supplied cookie/query value, which can contain any
 * Unicode. `.length` counts UTF-16 code units; `Buffer.from(x, "utf8")`
 * counts bytes, and a single non-ASCII character can span more than one —
 * two strings equal in `.length` can still produce differently-sized
 * buffers, and `timingSafeEqual` throws `RangeError` on a buffer-length
 * mismatch rather than returning `false`. Left on the string-length check
 * alone, a single non-ASCII byte in a guessed `?gate=` value crashes this
 * function on every request while the gate is active — found by a
 * reviewer's probe, not by reasoning about the API surface in the abstract.
 */
function secretsEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

function parseCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const pair of cookieHeader.split(";")) {
    const [key, ...rest] = pair.trim().split("=");
    if (key === name) return rest.join("=") || null;
  }
  return null;
}

/**
 * A `Set-Cookie` header value that carries the secret itself as the cookie
 * value — the cookie only ever needs to prove "this browser already knew
 * the secret," and storing the secret verbatim is what lets a later request
 * be checked the same way a fresh query-param request is, by the same
 * `secretsEqual` call. No `Max-Age`: session-scoped on purpose, since this
 * gate exists for a launch-gate window measured in weeks, not for a
 * long-lived credential worth remembering across browser restarts.
 */
function gateCookieHeader(secret: string): string {
  const parts = [`${cookieName()}=${secret}`, "HttpOnly", "SameSite=Lax", "Path=/"];
  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export type PrelaunchGateDecision =
  | { readonly kind: "allowed" }
  /** Allowed by the query parameter this once — the caller must also set this cookie on the response so the next request is `"allowed"` without repeating the secret in a URL. */
  | { readonly kind: "allowed_mint_cookie"; readonly setCookieHeader: string }
  | { readonly kind: "denied" };

/**
 * Evaluates a request against the gate. Takes the cookie and query-string
 * values directly (not a `NextRequest`) so this stays a pure function a
 * unit test can call with plain strings — `proxy.ts` is what adapts a real
 * request into these two values.
 */
export function evaluatePrelaunchGate(
  cookieHeader: string | null,
  queryValue: string | null,
  secret: string = prelaunchGateSecret(),
): PrelaunchGateDecision {
  const cookieValue = parseCookie(cookieHeader, cookieName());
  if (cookieValue !== null && secretsEqual(cookieValue, secret)) {
    return { kind: "allowed" };
  }
  if (queryValue !== null && secretsEqual(queryValue, secret)) {
    return { kind: "allowed_mint_cookie", setCookieHeader: gateCookieHeader(secret) };
  }
  return { kind: "denied" };
}
