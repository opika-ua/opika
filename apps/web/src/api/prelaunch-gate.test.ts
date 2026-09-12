import { afterEach, describe, expect, it, vi } from "vitest";
import { cookieName, evaluatePrelaunchGate } from "./prelaunch-gate";

const SECRET = "a-real-secret-value-not-guessable";

describe("evaluatePrelaunchGate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("denies a request with neither a cookie nor a query value", () => {
    expect(evaluatePrelaunchGate(null, null, SECRET)).toEqual({ kind: "denied" });
  });

  it("denies a request whose cookie carries the wrong secret", () => {
    const decision = evaluatePrelaunchGate(`${cookieName()}=wrong-guess`, null, SECRET);
    expect(decision).toEqual({ kind: "denied" });
  });

  it("denies a request whose query value carries the wrong secret", () => {
    const decision = evaluatePrelaunchGate(null, "wrong-guess", SECRET);
    expect(decision).toEqual({ kind: "denied" });
  });

  it("allows a request whose cookie carries the correct secret, without minting a new cookie", () => {
    const decision = evaluatePrelaunchGate(`${cookieName()}=${SECRET}`, null, SECRET);
    expect(decision).toEqual({ kind: "allowed" });
  });

  it("finds the gate cookie among other unrelated cookies on the same request", () => {
    const decision = evaluatePrelaunchGate(
      `session=abc123; ${cookieName()}=${SECRET}; other=xyz`,
      null,
      SECRET,
    );
    expect(decision).toEqual({ kind: "allowed" });
  });

  it("allows a request whose query value carries the correct secret, and mints a cookie carrying it", () => {
    const decision = evaluatePrelaunchGate(null, SECRET, SECRET);
    expect(decision.kind).toBe("allowed_mint_cookie");
    if (decision.kind !== "allowed_mint_cookie") throw new Error("unreachable");
    expect(decision.setCookieHeader).toContain(`${cookieName()}=${SECRET}`);
    expect(decision.setCookieHeader).toContain("HttpOnly");
    expect(decision.setCookieHeader).toContain("SameSite=Lax");
  });

  it("prefers a valid cookie over an invalid query value — an already-admitted browser is never re-checked against a mistyped param", () => {
    const decision = evaluatePrelaunchGate(`${cookieName()}=${SECRET}`, "garbage", SECRET);
    expect(decision).toEqual({ kind: "allowed" });
  });

  it("does not treat a secret-length-matching wrong guess as valid", () => {
    const wrongSameLength = "b".repeat(SECRET.length);
    expect(evaluatePrelaunchGate(null, wrongSameLength, SECRET)).toEqual({ kind: "denied" });
  });

  it("marks the cookie Secure only in production", () => {
    const decision = evaluatePrelaunchGate(null, SECRET, SECRET);
    if (decision.kind !== "allowed_mint_cookie") throw new Error("unreachable");
    expect(decision.setCookieHeader).not.toContain("Secure");
  });

  it("mints a __Host-prefixed, Secure cookie in production — the actual production shape, not just the dev fallback", () => {
    vi.stubEnv("NODE_ENV", "production");
    const decision = evaluatePrelaunchGate(null, SECRET, SECRET);
    if (decision.kind !== "allowed_mint_cookie") throw new Error("unreachable");
    expect(decision.setCookieHeader).toContain(`__Host-prelaunch-gate=${SECRET}`);
    expect(decision.setCookieHeader).toContain("Secure");
    expect(decision.setCookieHeader).toContain("HttpOnly");
    expect(decision.setCookieHeader).not.toContain("Domain=");
  });

  it("accepts the production __Host-prefixed cookie name on the way back in", () => {
    vi.stubEnv("NODE_ENV", "production");
    const decision = evaluatePrelaunchGate(`__Host-prelaunch-gate=${SECRET}`, null, SECRET);
    expect(decision).toEqual({ kind: "allowed" });
  });

  /**
   * Regression for a reviewer-found crash: `secretsEqual` used to compare
   * string `.length` (UTF-16 code units) before calling `timingSafeEqual`
   * on UTF-8 buffers. A guess equal in `.length` to the real secret but
   * containing a multi-byte character produces a *different* byte length,
   * which `timingSafeEqual` throws `RangeError` on rather than returning
   * `false` — an unauthenticated caller could crash this check on every
   * request just by trying a non-ASCII guess. Fixed by comparing buffer
   * length instead of string length.
   */
  it("denies, rather than throws on, a same-character-length guess containing a multi-byte character", () => {
    const nonAsciiGuess = `é${"a".repeat(SECRET.length - 1)}`;
    expect(nonAsciiGuess.length).toBe(SECRET.length);
    expect(() => evaluatePrelaunchGate(null, nonAsciiGuess, SECRET)).not.toThrow();
    expect(evaluatePrelaunchGate(null, nonAsciiGuess, SECRET)).toEqual({ kind: "denied" });
  });
});
