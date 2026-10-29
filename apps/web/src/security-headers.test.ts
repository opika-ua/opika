import { beforeEach, describe, expect, it, vi } from "vitest";
import { securityHeaders } from "./security-headers";

/**
 * Audit F5, the owner's scope: three enforced headers (nosniff, no framing,
 * HSTS for two years on subdomains, no preload) and a full policy that only
 * reports. Values are the owner's literals.
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

  it("enforces exactly these three, and nothing else is enforced", () => {
    expect(headerValue(production, "X-Content-Type-Options")).toBe("nosniff");
    expect(headerValue(production, "Content-Security-Policy")).toBe("frame-ancestors 'none'");
    expect(headerValue(production, "Strict-Transport-Security")).toBe(
      "max-age=63072000; includeSubDomains",
    );
    expect(production.map((h) => h.key).sort()).toEqual([
      "Content-Security-Policy",
      "Content-Security-Policy-Report-Only",
      "Strict-Transport-Security",
      "X-Content-Type-Options",
    ]);
  });

  it("reports, never blocks: the full policy is report-only, with no reporting endpoint", () => {
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

describe("next.config.ts headers()", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it.each([true, false])(
    "sends the security headers on every route, discoverable: %s",
    async (discoverable) => {
      vi.doMock("./seo-flags", () => ({
        SITE_IS_PUBLICLY_DISCOVERABLE: discoverable,
        REGISTRY_HAS_NO_REAL_SHELTERS: !discoverable,
        assertDemoDiscoverabilityInvariant: vi.fn(),
      }));
      const nextConfig = (await import("../next.config")).default;
      const entries = (await nextConfig.headers?.()) ?? [];
      const everyRoute = entries.filter((entry) => entry.source === "/:path*");
      const sent = everyRoute.flatMap((entry) => entry.headers);
      expect(headerValue(sent, "X-Content-Type-Options")).toBe("nosniff");
      expect(headerValue(sent, "Content-Security-Policy")).toBe("frame-ancestors 'none'");
      expect(headerValue(sent, "Strict-Transport-Security")).toBe(
        "max-age=63072000; includeSubDomains",
      );
      expect(headerValue(sent, "Content-Security-Policy-Report-Only")).toContain(
        "default-src 'self'",
      );
    },
  );
});
