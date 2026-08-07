import { describe, expect, it } from "vitest";
import { clientIp } from "./client-ip";

const requestWith = (headers: Record<string, string>) =>
  new Request("https://example.test/tvaryny", { headers });

describe("clientIp header precedence", () => {
  it("prefers x-vercel-forwarded-for over the others", () => {
    expect(
      clientIp(
        requestWith({
          "x-vercel-forwarded-for": "203.0.113.1",
          "x-forwarded-for": "203.0.113.2",
          "x-real-ip": "203.0.113.3",
        }),
      ),
    ).toBe("203.0.113.1");
  });

  it("falls back to x-forwarded-for, then x-real-ip", () => {
    expect(clientIp(requestWith({ "x-forwarded-for": "203.0.113.2" }))).toBe("203.0.113.2");
    expect(clientIp(requestWith({ "x-real-ip": "203.0.113.3" }))).toBe("203.0.113.3");
  });

  it("is 'unknown' when nothing sets one — local dev, and the documented fallback", () => {
    expect(clientIp(requestWith({}))).toBe("unknown");
  });
});

describe("clientIp parsing", () => {
  it("takes the leftmost entry of a forwarded chain, not the whole header", () => {
    expect(
      clientIp(requestWith({ "x-forwarded-for": "203.0.113.2, 70.41.3.18, 150.172.238.178" })),
    ).toBe("203.0.113.2");
  });

  /**
   * The regression these two guard: `headers.get()` answers `""`, not `null`,
   * for a present-but-empty header, so a plain `??` chain returns `""` and
   * every caller behind that upstream shares one rate-limit bucket. Same
   * collapse, one level down, for a chain with a leading empty element.
   */
  it("skips a present-but-empty header instead of keying on the empty string", () => {
    expect(
      clientIp(requestWith({ "x-vercel-forwarded-for": "", "x-forwarded-for": "203.0.113.2" })),
    ).toBe("203.0.113.2");
    expect(clientIp(requestWith({ "x-forwarded-for": "   ", "x-real-ip": "203.0.113.3" }))).toBe(
      "203.0.113.3",
    );
    expect(clientIp(requestWith({ "x-forwarded-for": "" }))).toBe("unknown");
  });

  it("skips a leading empty element in a chain", () => {
    expect(clientIp(requestWith({ "x-forwarded-for": ", 203.0.113.2" }))).toBe("203.0.113.2");
  });

  /**
   * Applied to the Vercel-specific header too, not only to `x-forwarded-for`.
   * An unsplit chain here would become the rate-limit key whole, and rotating
   * any element of it would mint a fresh budget.
   */
  it("splits x-vercel-forwarded-for the same way", () => {
    expect(clientIp(requestWith({ "x-vercel-forwarded-for": "203.0.113.1, 70.41.3.18" }))).toBe(
      "203.0.113.1",
    );
  });
});
