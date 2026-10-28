/**
 * Audit F5: the browser security headers on every response (`next.config.ts`).
 * Enforced: no MIME sniffing, no framing by any site, HSTS for two years on
 * every subdomain (no preload). The full policy is report-only until its
 * reports have been read: nothing in it blocks anything yet.
 */
export type SecurityHeader = { key: string; value: string };

export type SecurityHeaderOptions = {
  /** `NEXT_PUBLIC_R2_PUBLIC_BASE_URL`: the CDN the photos are served from. */
  photoBaseUrl: string | undefined;
  /** `next dev`: React's dev build uses eval, and Vercel's scripts load from their CDN. */
  development: boolean;
};

export function securityHeaders(options: SecurityHeaderOptions): SecurityHeader[] {
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    { key: "Content-Security-Policy-Report-Only", value: reportOnlyPolicy(options) },
  ];
}

/**
 * No nonce: Next's App Router inlines its own scripts, and a nonce needs every
 * page rendered per request. So scripts and styles allow 'unsafe-inline' and
 * the policy's value is in what it shuts out: other origins' scripts, plugins,
 * `<base>` rewrites, forms posting elsewhere. `frame-ancestors` is left to the
 * enforced header (browsers ignore it in report-only), and there is no
 * `report-uri`: violations show in the browser console only.
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
