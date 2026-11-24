import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { stripKabinetQuery, withoutKabinetQuery } from "./analytics-url";

/**
 * Oleksii, 2026-10-20 (sign-in pages) and 2026-11-24 ("strip the query on every /kabinet
 * page"), verbatim in `analytics-url.ts`. What the two libraries are handed is captured from their
 * real props, so the test fails if either loses the function or gets another.
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

describe("withoutKabinetQuery", () => {
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
    // R3: the confirmation email's two link pages carry a registration token.
    [
      "https://example.org/kabinet/zaiavka/pidtverdyty?token=abc123",
      "https://example.org/kabinet/zaiavka/pidtverdyty",
    ],
    ["/kabinet/zaiavka/ne-ya?token=abc123", "/kabinet/zaiavka/ne-ya"],
  ])("strips the query from a sign-in page: %s", (url, stripped) => {
    expect(withoutKabinetQuery(url)).toBe(stripped);
    expect(withoutKabinetQuery(url)).not.toContain("abc123");
  });

  // Audit 2026-11-24 (B-L3): the operator's free-text shelter search, and every other kabinet page.
  it.each([
    [
      "https://example.org/kabinet/prytulky?q=olena@example.org",
      "https://example.org/kabinet/prytulky",
    ],
    ["/kabinet/prytulky?q=olena@example.org", "/kabinet/prytulky"],
    // The list's real search key (`LIST_PARAMS.search`).
    ["/kabinet/prytulky?poshuk=olena%40example.org&status=pending", "/kabinet/prytulky"],
    ["https://example.org/kabinet?q=olena@example.org", "https://example.org/kabinet"],
    ["/kabinet/tvaryny?filter=all#top", "/kabinet/tvaryny#top"],
    [
      "https://example.org/kabinet/vkhidno?q=olena@example.org",
      "https://example.org/kabinet/vkhidno",
    ],
  ])("strips the query from every kabinet page: %s", (url, stripped) => {
    expect(withoutKabinetQuery(url)).toBe(stripped);
    expect(withoutKabinetQuery(url)).not.toContain("olena");
  });

  it.each([
    "https://example.org/tvaryny?stor=2&vyd=pes",
    "https://example.org/prytulky/kyiv?stor=2",
    "https://example.org/kabinetx?q=olena@example.org",
    "https://example.org/pro/kabinet?q=1",
    "https://example.org/kabinet/vkhid/zabuly",
    "/tvaryny?stor=3",
    "not a url",
  ])("leaves every other URL exactly as it came: %s", (url) => {
    expect(withoutKabinetQuery(url)).toBe(url);
  });

  it("keeps the rest of the event", () => {
    expect(
      stripKabinetQuery({
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
    expect(handed.analytics).toBe(stripKabinetQuery);
    expect(handed.speedInsights).toBe(stripKabinetQuery);
  });
});
