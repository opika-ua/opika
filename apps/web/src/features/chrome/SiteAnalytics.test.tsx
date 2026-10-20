import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { stripSignInQuery, withoutSignInQuery } from "./analytics-url";

/**
 * Oleksii, 2026-10-20, verbatim: "Analytics: in Vercel Analytics' and Speed Insights'
 * beforeSend, strip the query string from /kabinet/vkhid* URLs, with a test." What the two
 * libraries are handed is captured from their real props, so the test fails if either loses the
 * function or gets another.
 */

const handed: Record<string, unknown> = {};
vi.mock("@vercel/analytics/next", () => ({
  Analytics: (props: { beforeSend?: unknown }) => {
    handed.analytics = props.beforeSend;
    return null;
  },
}));
vi.mock("@vercel/speed-insights/next", () => ({
  SpeedInsights: (props: { beforeSend?: unknown }) => {
    handed.speedInsights = props.beforeSend;
    return null;
  },
}));

const { SiteAnalytics } = await import("./SiteAnalytics");

describe("withoutSignInQuery", () => {
  it.each([
    [
      "https://example.org/kabinet/vkhid/novyi-parol?token=abc123",
      "https://example.org/kabinet/vkhid/novyi-parol",
    ],
    [
      "https://example.org/kabinet/vkhid/pidtverdzhennia?token=abc123",
      "https://example.org/kabinet/vkhid/pidtverdzhennia",
    ],
    ["https://example.org/kabinet/vkhid?zaproshennia=xyz", "https://example.org/kabinet/vkhid"],
    ["/kabinet/vkhid/novyi-parol?token=abc123", "/kabinet/vkhid/novyi-parol"],
  ])("strips the query from a sign-in page: %s", (url, stripped) => {
    expect(withoutSignInQuery(url)).toBe(stripped);
    expect(withoutSignInQuery(url)).not.toContain("abc123");
  });

  it.each([
    "https://example.org/tvaryny?stor=2&vyd=pes",
    "https://example.org/kabinet/tvaryny?filter=all",
    "https://example.org/kabinet/vkhidno?token=abc",
    "https://example.org/kabinet/vkhid/zabuly",
    "/tvaryny?stor=3",
    "not a url",
  ])("leaves every other URL exactly as it came: %s", (url) => {
    expect(withoutSignInQuery(url)).toBe(url);
  });

  it("keeps the rest of the event", () => {
    expect(
      stripSignInQuery({
        type: "vital",
        url: "https://example.org/kabinet/vkhid/novyi-parol?token=t",
        route: "/r",
      }),
    ).toEqual({ type: "vital", url: "https://example.org/kabinet/vkhid/novyi-parol", route: "/r" });
  });
});

describe("SiteAnalytics", () => {
  it("hands both libraries the one beforeSend", () => {
    render(<SiteAnalytics />);
    expect(handed.analytics).toBe(stripSignInQuery);
    expect(handed.speedInsights).toBe(stripSignInQuery);
  });
});
