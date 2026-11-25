import { createHash } from "node:crypto";
import { SAVED_PREPAINT_SCRIPT } from "./features/chrome/saved-prepaint";
import { STRIP_TOKEN_FROM_ADDRESS_BAR } from "./kabinet/strip-token-script";
import { securityReportUrlOf } from "./observability/dsn";

/**
 * Audit F5: the browser security headers on every response (`next.config.ts`). The owner's enforced
 * set is pinned in the test; the rest stays report-only on public pages. /kabinet enforces it all, with
 * a nonce (audit B1, `kabinetContentSecurityPolicy`).
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
] as const;

const CSP_REPORT_GROUP = "csp-endpoint";

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
 * No nonce (Next inlines its scripts; a nonce means rendering every page per request), so its value is
 * in what it shuts out: other origins. No `frame-ancestors`: browsers ignore it in report-only.
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
  extraImageSources: readonly string[] = [],
): Directive[] {
  const photoOrigin = originOf(photoBaseUrl);
  return [
    ["default-src", "'self'"],
    scriptSrc,
    ["style-src", "'self'", "'unsafe-inline'"],
    [
      "img-src",
      "'self'",
      "data:",
      ...extraImageSources,
      ...(photoOrigin === null ? [] : [photoOrigin]),
    ],
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

/**
 * Audit B1 (owner, 2026-11-24): the enforced /kabinet policy, a fresh nonce per request (`proxy.ts`).
 * The root layout's inline script goes by its hash, so that layout never reads the request and public
 * pages stay static. `'self'` is only for browsers without `'strict-dynamic'`.
 */
export function kabinetContentSecurityPolicy(
  options: SecurityHeaderOptions & { nonce: string },
): string {
  const scriptSrc: Directive = [
    "script-src",
    "'self'",
    `'nonce-${options.nonce}'`,
    "'strict-dynamic'",
    ...KABINET_INLINE_SCRIPT_HASHES,
    // React's dev build rebuilds server error stacks with eval; production never does (Next's CSP guide).
    ...(options.development ? ["'unsafe-eval'"] : []),
  ];
  // `blob:`: photo compression's last decode route loads the picked file into an <img> (iOS 16 WebKit).
  return joined([
    ...policyDirectives(options, scriptSrc, ["blob:"]),
    ["frame-ancestors", "'none'"],
  ]);
}

/** A CSP hash source for an inline script's exact text. */
const scriptHashSource = (script: string): string =>
  `'sha256-${createHash("sha256").update(script, "utf8").digest("base64")}'`;

/**
 * The inline scripts a kabinet response carries without a nonce: the root layout's pre-paint one, and
 * the token strip on the email-link pages, which are route handlers writing their own HTML.
 */
const KABINET_INLINE_SCRIPT_HASHES: readonly string[] = [
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
