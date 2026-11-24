import { createHash } from "node:crypto";
import { SAVED_PREPAINT_SCRIPT } from "./features/chrome/saved-prepaint";
import { STRIP_TOKEN_FROM_ADDRESS_BAR } from "./kabinet/strip-token-script";
import { securityReportUrlOf } from "./observability/dsn";

/**
 * Audit F5: the browser security headers on every response (`next.config.ts`). The owner's enforced
 * set is pinned in the test; the rest stays report-only on public pages. /kabinet enforces it all, with
 * a nonce (audit B1); public pages trial the same policy report-only (`nonceContentSecurityPolicy`).
 */
export type SecurityHeader = { key: string; value: string };
export type HeaderRule = { source: string; headers: SecurityHeader[] };

export type SecurityHeaderOptions = {
  /** `NEXT_PUBLIC_R2_PUBLIC_BASE_URL`: the CDN the photos are served from. */
  photoBaseUrl: string | undefined;
  /** `next dev`: React's dev build uses eval, and Vercel's scripts load from their CDN. */
  development: boolean;
};

/**
 * Every /kabinet response, the token pages and the magic-link confirm page included (owner, 2026-11-16):
 * the origin alone, never a path or a token; unlike `no-referrer`, a form POST keeps a real Origin (IN-T8).
 */
export const KABINET_REFERRER_POLICY = "strict-origin";

/**
 * The one source of Referrer-Policy: the proxy, route handlers and page metadata set none, so header
 * order has nothing to resolve. In order: the last matching rule's value for a key wins (Next's docs).
 */
export const REFERRER_POLICY_RULES: readonly HeaderRule[] = [
  { source: "/:path*", headers: [referrerPolicy("strict-origin-when-cross-origin")] },
  { source: "/kabinet/:path*", headers: [referrerPolicy(KABINET_REFERRER_POLICY)] },
];

function referrerPolicy(value: string): SecurityHeader {
  return { key: "Referrer-Policy", value };
}

export function securityHeaders(options: SecurityHeaderOptions): SecurityHeader[] {
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    // Nothing here embeds plugins, sets <base>, posts a form off-site or needs window.opener.
    { key: "Content-Security-Policy", value: SITE_WIDE_ENFORCED_POLICY },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    // Nothing here uses these; an empty allowlist also stops an embedded script from asking.
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    },
    { key: "Content-Security-Policy-Report-Only", value: reportOnlyPolicy(options) },
  ];
}

/**
 * The only pages whose CSP violations reach Sentry (owner, 2026-11-16): an allowlist, so the
 * kabinet, a page with a token in its URL and any route added later report nowhere until listed.
 */
export const CSP_REPORTING_SOURCES = [
  "/tvaryny/:path*",
  "/prytulky/:path*",
  "/pro",
  "/prytulkam",
  "/zberezheni",
  "/polityka-konfidentsiinosti",
] as const;

const CSP_REPORT_GROUP = "csp-endpoint";

/**
 * Whether a path is on that allowlist, for the proxy's nonce policy: the same sources, read as
 * next.config reads them (`/:path*` is the path itself and anything below it).
 */
export function isCspReportingPath(pathname: string): boolean {
  return CSP_REPORTING_SOURCES.some((source) => {
    if (!source.endsWith(ANY_SUB_PATH)) return pathname === source;
    const base = source.slice(0, -ANY_SUB_PATH.length);
    return pathname === base || pathname.startsWith(`${base}/`);
  });
}

const ANY_SUB_PATH = "/:path*";

/**
 * The report-only policy plus `report-to` on the allowlisted pages, replacing the site-wide value there.
 * No `report-uri` (WebKit's posts carry the full User-Agent; docs/security.md). No usable DSN, no rules.
 */
export function cspReportingRules(
  options: SecurityHeaderOptions,
  sentryDsn: string | undefined,
): HeaderRule[] {
  const reportUrl = securityReportUrlOf(sentryDsn);
  if (reportUrl === null) return [];
  return CSP_REPORTING_SOURCES.map((source) => ({
    source,
    headers: [
      {
        key: "Content-Security-Policy-Report-Only",
        value: `${reportOnlyPolicy(options)}; report-to ${CSP_REPORT_GROUP}`,
      },
      { key: "Reporting-Endpoints", value: `${CSP_REPORT_GROUP}="${reportUrl}"` },
    ],
  }));
}

/** The enforced policy on every response; the kabinet's own policy repeats all four. */
const SITE_WIDE_ENFORCED_POLICY =
  "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'";

type Directive = [string, ...string[]];

const VERCEL_SCRIPT_CDN = "https://va.vercel-scripts.com";

const joined = (directives: readonly Directive[]): string =>
  directives.map((d) => d.join(" ")).join("; ");

/**
 * The site-wide fallback, with no nonce: what a response the proxy gives no nonce policy keeps (an
 * API answer, a file, `/rate-limited`). No `frame-ancestors`: browsers ignore it in report-only.
 */
function reportOnlyPolicy(options: SecurityHeaderOptions): string {
  const scriptSrc: Directive = [
    "script-src",
    "'self'",
    "'unsafe-inline'",
    ...(options.development ? ["'unsafe-eval'", VERCEL_SCRIPT_CDN] : []),
  ];
  return joined(policyDirectives(options, scriptSrc));
}

/** Every directive but the script rule, which each policy brings: one list, so the two never drift. */
function policyDirectives(
  { photoBaseUrl, development }: SecurityHeaderOptions,
  scriptSrc: Directive,
): Directive[] {
  const photoOrigin = originOf(photoBaseUrl);
  return [
    ["default-src", "'self'"],
    scriptSrc,
    ["style-src", "'self'", "'unsafe-inline'"],
    ["img-src", "'self'", "data:", ...(photoOrigin === null ? [] : [photoOrigin])],
    ["font-src", "'self'"],
    ["connect-src", "'self'", ...(development ? [VERCEL_SCRIPT_CDN] : [])],
    ["media-src", "'self'"],
    ["worker-src", "'self'"],
    ["manifest-src", "'self'"],
    ["frame-src", "'none'"],
    ["object-src", "'none'"],
    ["base-uri", "'self'"],
    ["form-action", "'self'"],
  ];
}

/** Enforced on /kabinet (audit B1); report-only on public pages for the trial (owner, 2026-11-24, D3). */
export type CspMode = "enforce" | "report";

/** The response header a policy in each mode travels in. */
export const CSP_HEADER_OF: Readonly<Record<CspMode, string>> = {
  enforce: "content-security-policy",
  report: "content-security-policy-report-only",
};

/**
 * The request header Next reads the nonce from, in both modes: on Vercel a report-only one left the
 * public pages' scripts without a nonce (#589). It is internal and never reaches the browser.
 */
export const NONCE_REQUEST_HEADER = CSP_HEADER_OF.enforce;

/**
 * The nonce policy (audit B1), a fresh nonce per request (`proxy.ts`): enforced on /kabinet, report-only
 * on public pages. The root layout's inline script goes by its hash, so that layout never reads the
 * request. `'self'` is only for browsers without `'strict-dynamic'`.
 */
export function nonceContentSecurityPolicy(
  options: SecurityHeaderOptions & { nonce: string; mode: CspMode; reportTo: boolean },
): string {
  const scriptSrc: Directive = [
    "script-src",
    "'self'",
    `'nonce-${options.nonce}'`,
    "'strict-dynamic'",
    ...INLINE_SCRIPT_HASHES,
    // React's dev build rebuilds server error stacks with eval; production never does (Next's CSP guide).
    ...(options.development ? ["'unsafe-eval'"] : []),
  ];
  // A report-only frame-ancestors is ignored and logs a console warning, so only enforce carries it.
  const modeDirectives: Directive[] =
    options.mode === "enforce" ? [["frame-ancestors", "'none'"]] : [];
  const reporting: Directive[] = options.reportTo ? [["report-to", CSP_REPORT_GROUP]] : [];
  return joined([...policyDirectives(options, scriptSrc), ...modeDirectives, ...reporting]);
}

/** A CSP hash source for an inline script's exact text. */
const scriptHashSource = (script: string): string =>
  `'sha256-${createHash("sha256").update(script, "utf8").digest("base64")}'`;

/**
 * The inline scripts a response carries without a nonce: the root layout's pre-paint one, and the
 * kabinet's token strip on the email-link pages, which are route handlers writing their own HTML.
 */
const INLINE_SCRIPT_HASHES: readonly string[] = [
  scriptHashSource(SAVED_PREPAINT_SCRIPT),
  scriptHashSource(STRIP_TOKEN_FROM_ADDRESS_BAR),
];

/** 128 random bits, base64: the form Next's nonce parser accepts. */
export function newCspNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

function originOf(url: string | undefined): string | null {
  if (url === undefined || url === "") return null;
  try {
    const { origin } = new URL(url);
    return origin === "null" ? null : origin;
  } catch {
    return null;
  }
}
