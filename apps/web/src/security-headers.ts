import { securityReportUrlOf } from "./observability/dsn";

/**
 * Audit F5: the browser security headers on every response (`next.config.ts`). The owner's enforced
 * set is pinned in the test; the rest (scripts, styles, connections) stays report-only until read.
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
    {
      key: "Content-Security-Policy",
      value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
    },
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
 * The site-wide report-only policy plus where to report, on the allowlisted pages; listed after the
 * site-wide rule, so it replaces that value there. `report-uri` too: Firefox and Safari have no
 * Reporting API. No usable DSN, no rules: nothing reports anywhere.
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
        value: `${reportOnlyPolicy(options)}; report-uri ${reportUrl}; report-to ${CSP_REPORT_GROUP}`,
      },
      { key: "Reporting-Endpoints", value: `${CSP_REPORT_GROUP}="${reportUrl}"` },
    ],
  }));
}

/**
 * No nonce (Next inlines its scripts; a nonce means rendering every page per request), so its value is
 * in what it shuts out: other origins. No `frame-ancestors`: browsers ignore it in report-only.
 */
function reportOnlyPolicy({ photoBaseUrl, development }: SecurityHeaderOptions): string {
  const photoOrigin = originOf(photoBaseUrl);
  const vercelScriptCdn = "https://va.vercel-scripts.com";
  const directives: [string, ...string[]][] = [
    ["default-src", "'self'"],
    [
      "script-src",
      "'self'",
      "'unsafe-inline'",
      ...(development ? ["'unsafe-eval'", vercelScriptCdn] : []),
    ],
    ["style-src", "'self'", "'unsafe-inline'"],
    ["img-src", "'self'", "data:", ...(photoOrigin === null ? [] : [photoOrigin])],
    ["font-src", "'self'"],
    ["connect-src", "'self'", ...(development ? [vercelScriptCdn] : [])],
    ["media-src", "'self'"],
    ["worker-src", "'self'"],
    ["manifest-src", "'self'"],
    ["frame-src", "'none'"],
    ["object-src", "'none'"],
    ["base-uri", "'self'"],
    ["form-action", "'self'"],
  ];
  return directives.map((d) => d.join(" ")).join("; ");
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
