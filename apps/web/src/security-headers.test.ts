import { checkCustomRoutes } from "next/dist/lib/load-custom-routes";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sentOn } from "../test/next-headers";
import { securityReportUrlOf } from "./observability/dsn";
import { KABINET_REFERRER_POLICY, securityHeaders } from "./security-headers";

/**
 * Audit F5, the owner's scope: the enforced headers (nosniff; CSP frame-ancestors, object-src,
 * base-uri, form-action; COOP same-origin; HSTS for two years on subdomains, no preload) and a
 * full policy that only reports. Values are the owner's literals.
 */
const PHOTOS = "https://cdn.opika.example/some/path";

const headerValue = (headers: { key: string; value: string }[], key: string) =>
  headers.find((h) => h.key === key)?.value;

/** The directives of a policy, by name. */
function directivesOf(policy: string | undefined): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const part of (policy ?? "").split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) map.set(name, sources);
  }
  return map;
}

describe("securityHeaders", () => {
  const production = securityHeaders({ photoBaseUrl: PHOTOS, development: false });

  it("enforces exactly these, and nothing else is enforced", () => {
    expect(headerValue(production, "X-Content-Type-Options")).toBe("nosniff");
    expect(headerValue(production, "Content-Security-Policy")).toBe(
      "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
    );
    expect(headerValue(production, "Cross-Origin-Opener-Policy")).toBe("same-origin");
    expect(headerValue(production, "Strict-Transport-Security")).toBe(
      "max-age=63072000; includeSubDomains",
    );
    expect(production.map((h) => h.key).sort()).toEqual([
      "Content-Security-Policy",
      "Content-Security-Policy-Report-Only",
      "Cross-Origin-Opener-Policy",
      "Permissions-Policy",
      "Strict-Transport-Security",
      "X-Content-Type-Options",
    ]);
  });

  it("switches off the browser features nothing here uses", () => {
    const features = (headerValue(production, "Permissions-Policy") ?? "").split(", ").sort();
    expect(features).toEqual([
      "camera=()",
      "geolocation=()",
      "microphone=()",
      "payment=()",
      "usb=()",
    ]);
  });

  it("reports, never blocks: the site-wide policy is report-only and names no reporting endpoint", () => {
    const policy = directivesOf(headerValue(production, "Content-Security-Policy-Report-Only"));
    expect(policy.get("default-src")).toEqual(["'self'"]);
    expect(policy.get("object-src")).toEqual(["'none'"]);
    expect(policy.get("base-uri")).toEqual(["'self'"]);
    expect(policy.get("form-action")).toEqual(["'self'"]);
    expect(policy.has("report-uri")).toBe(false);
    expect(policy.has("report-to")).toBe(false);
    // Ignored by browsers in a report-only policy; the enforced header carries it.
    expect(policy.has("frame-ancestors")).toBe(false);
  });

  it("lets Next's inline scripts and styles through, and photos from the CDN's origin only", () => {
    const policy = directivesOf(headerValue(production, "Content-Security-Policy-Report-Only"));
    expect(policy.get("script-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(policy.get("style-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(policy.get("img-src")).toEqual(["'self'", "data:", "https://cdn.opika.example"]);
    expect(policy.get("connect-src")).toEqual(["'self'"]);
  });

  it("allows eval and Vercel's script CDN in `next dev` only", () => {
    const dev = directivesOf(
      headerValue(
        securityHeaders({ photoBaseUrl: PHOTOS, development: true }),
        "Content-Security-Policy-Report-Only",
      ),
    );
    expect(dev.get("script-src")).toEqual([
      "'self'",
      "'unsafe-inline'",
      "'unsafe-eval'",
      "https://va.vercel-scripts.com",
    ]);
  });

  it("leaves the CDN out when its URL is missing or unreadable", () => {
    for (const photoBaseUrl of [undefined, "", "not a url"]) {
      const policy = directivesOf(
        headerValue(
          securityHeaders({ photoBaseUrl, development: false }),
          "Content-Security-Policy-Report-Only",
        ),
      );
      expect(policy.get("img-src"), String(photoBaseUrl)).toEqual(["'self'", "data:"]);
    }
  });
});

const KEY = "0123456789abcdef0123456789abcdef";
const DSN = `https://${KEY}@o1.ingest.de.sentry.io/4500000000000001`;
const REPORT_URL = `https://o1.ingest.de.sentry.io/api/4500000000000001/security/?sentry_key=${KEY}`;
/** Each refused by the DSN parsing, so none may turn reporting on. */
const UNUSABLE_DSNS = [
  undefined,
  "",
  "   ",
  "not a dsn",
  `http://${KEY}@o1.ingest.de.sentry.io/4500000000000001`,
  "https://o1.ingest.de.sentry.io/4500000000000001",
  `https://${KEY}@o1.ingest.de.sentry.io:8443/4500000000000001`,
  `https://${KEY}@o1.ingest.de.sentry.io/prefix/4500000000000001`,
  // A key that could end the quoted endpoint or the directive it sits in.
  "https://k,ey@o1.ingest.de.sentry.io/4500000000000001",
  'https://k"ey@o1.ingest.de.sentry.io/4500000000000001',
];

describe("the CSP report endpoint, from NEXT_PUBLIC_SENTRY_DSN", () => {
  it("is Sentry's security endpoint for the DSN's own project and key", () => {
    expect(securityReportUrlOf(DSN)).toBe(REPORT_URL);
    expect(securityReportUrlOf(` ${DSN.replace("o1.ingest", "O1.INGEST")} `)).toBe(REPORT_URL);
  });

  it("is none for a DSN that is unset, malformed or carries an unsafe key", () => {
    for (const dsn of UNUSABLE_DSNS) expect(securityReportUrlOf(dsn), String(dsn)).toBeNull();
  });
});

/** next.config's real `headers()` under this DSN, checked the way `next build` checks them. */
async function headersUnder(dsn: string | undefined, discoverable: boolean) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", dsn);
  vi.doMock("./seo-flags", () => ({
    SITE_IS_PUBLICLY_DISCOVERABLE: discoverable,
    REGISTRY_HAS_NO_REAL_SHELTERS: !discoverable,
    assertDemoDiscoverabilityInvariant: vi.fn(),
  }));
  const nextConfig = (await import("../next.config")).default;
  const rules = (await nextConfig.headers?.()) ?? [];
  checkCustomRoutes(rules, "header");
  return (url: string) => sentOn(rules, url);
}

const SITE_WIDE_REPORT_ONLY = headerValue(
  securityHeaders({ photoBaseUrl: process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL, development: false }),
  "Content-Security-Policy-Report-Only",
);

/** The owner's allowlist (2026-11-16), each pattern with and without a sub-path or a query. */
const REPORTING = [
  "/tvaryny",
  "/tvaryny?misto=kyiv&stor=2",
  "/tvaryny/some-animal-id",
  "/tvaryny/some-animal-id?utm_source=x",
  "/prytulky",
  "/prytulky/some-shelter-id",
  "/prytulky/some-shelter-id?vyd=cat",
  "/pro",
  "/pro?fbclid=x",
  "/prytulkam",
  "/prytulkam?gclid=x",
  "/zberezheni",
  "/zberezheni?sort=new",
];

/** The kabinet, token pages, routes nobody listed (a future one included) and look-alikes. */
const NOT_REPORTING = [
  "/",
  "/kabinet",
  "/kabinet/tvaryny/some-animal-id",
  "/kabinet/vkhid",
  "/kabinet/vkhid?zaproshennia=x",
  "/kabinet/vkhid/novyi-parol?token=x",
  "/kabinet/vkhid/pidtverdzhennia?token=x",
  "/some-new-page",
  "/some-new-page?token=x",
  "/pro/a-new-sub-page",
  "/prytulkam/x",
  "/zberezheni/x",
  "/tvaryny-x",
  "/api/rpc/animals/cardsByIds",
  "/rate-limited",
];

const REPORTING_KEYS = ["content-security-policy-report-only", "reporting-endpoints"];

describe("next.config.ts headers(), as Next sends them", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("./seo-flags");
  });

  it.each([true, false])(
    "sends the security headers on every route, discoverable: %s",
    async (discoverable) => {
      const sent = await headersUnder(undefined, discoverable);
      for (const url of [...REPORTING, ...NOT_REPORTING]) {
        const headers = sent(url);
        expect(headers.get("x-content-type-options"), url).toBe("nosniff");
        expect(headers.get("content-security-policy"), url).toBe(
          "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
        );
        expect(headers.get("cross-origin-opener-policy"), url).toBe("same-origin");
        expect(headers.get("strict-transport-security"), url).toBe(
          "max-age=63072000; includeSubDomains",
        );
        expect(headers.get("content-security-policy-report-only"), url).toContain(
          "default-src 'self'",
        );
      }
    },
  );

  it("with a DSN, every allowlisted page reports to Sentry's security endpoint, both ways", async () => {
    const sent = await headersUnder(DSN, true);
    for (const url of REPORTING) {
      const headers = sent(url);
      expect(headers.get("reporting-endpoints"), url).toBe(`csp-endpoint="${REPORT_URL}"`);
      const policy = directivesOf(headers.get("content-security-policy-report-only"));
      expect(policy.get("report-uri"), url).toEqual([REPORT_URL]);
      expect(policy.get("report-to"), url).toEqual(["csp-endpoint"]);
      // The same policy as everywhere else, only with somewhere to report.
      policy.delete("report-uri");
      policy.delete("report-to");
      expect(policy, url).toEqual(directivesOf(SITE_WIDE_REPORT_ONLY));
    }
  });

  it("with a DSN, nothing outside the allowlist reports: not the kabinet, not a token page, not a new route", async () => {
    const sent = await headersUnder(DSN, true);
    for (const url of NOT_REPORTING) {
      const headers = sent(url);
      expect(headers.has("reporting-endpoints"), url).toBe(false);
      expect(headers.get("content-security-policy-report-only"), url).toBe(SITE_WIDE_REPORT_ONLY);
    }
  });

  it("with a DSN, nothing but the two reporting headers changes, on any route", async () => {
    const without = await headersUnder(undefined, true);
    const withDsn = await headersUnder(DSN, true);
    const others = (headers: Map<string, string>) =>
      [...headers].filter(([key]) => !REPORTING_KEYS.includes(key));
    for (const url of [...REPORTING, ...NOT_REPORTING]) {
      expect(others(withDsn(url)), url).toEqual(others(without(url)));
    }
  });

  it("with no usable DSN, nothing reports anywhere and the report-only policy is the site-wide one", async () => {
    for (const dsn of UNUSABLE_DSNS) {
      const sent = await headersUnder(dsn, true);
      for (const url of [...REPORTING, ...NOT_REPORTING]) {
        const headers = sent(url);
        expect(headers.has("reporting-endpoints"), `${dsn} ${url}`).toBe(false);
        expect(headers.get("content-security-policy-report-only"), `${dsn} ${url}`).toBe(
          SITE_WIDE_REPORT_ONLY,
        );
      }
    }
  });

  /**
   * Owner, 2026-11-16: `strict-origin` on every /kabinet response, the confirm page and the token
   * pages included, with no exception; public pages keep `strict-origin-when-cross-origin`.
   */
  it.each([undefined, DSN])(
    "Referrer-Policy: strict-origin on all of /kabinet, the public default elsewhere (DSN %s)",
    async (dsn) => {
      const sent = await headersUnder(dsn, true);
      const policyOn = (url: string) => sent(url).get("referrer-policy");
      for (const url of [
        "/",
        "/tvaryny",
        "/tvaryny/some-animal-id?misto=kyiv",
        "/prytulky/some-shelter-id",
        "/pro",
        "/prytulkam",
        "/zberezheni",
        "/some-new-page",
        "/kabinet-x",
        "/api/rpc/animals/cardsByIds",
      ]) {
        expect(policyOn(url), url).toBe("strict-origin-when-cross-origin");
      }
      for (const url of [
        "/kabinet",
        "/kabinet/",
        "/kabinet/tvaryny",
        "/kabinet/tvaryny/some-animal-id?tab=photos",
        "/kabinet/prytulky/novyi",
        "/kabinet/akaunt",
        "/kabinet/vkhid",
        "/kabinet/vkhid?zaproshennia=x",
        "/kabinet/vkhid/zabuly",
        "/kabinet/vkhid/novyi-parol?token=x",
        "/kabinet/vkhid/pidtverdzhennia",
        "/kabinet/vkhid/pidtverdzhennia?token=x",
      ]) {
        expect(policyOn(url), url).toBe("strict-origin");
      }
      expect(KABINET_REFERRER_POLICY).toBe("strict-origin");
    },
  );
});
