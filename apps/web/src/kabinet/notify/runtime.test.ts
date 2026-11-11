import { describe, expect, it } from "vitest";
import { DEFAULT_DAILY_EVENT_CAP, eventCapOf, notifyRuntimeOf } from "./runtime";

/**
 * Whether a deployment may send notification mail at all is the same gate as every kabinet mail:
 * production only, and only while production sign-in is on. Example values, never a real key.
 */

const full = {
  EMAIL_PROVIDER: "resend",
  RESEND_API_KEY: "resend-key",
  EMAIL_FROM_ADDRESS: "kabinet@mail.example.org",
  EMAIL_REPLY_TO: "hello@example.org",
  PRODUCTION_ORIGIN: "https://example.org",
  BETTER_AUTH_SECRET: "s".repeat(32),
  BETTER_AUTH_URL: "https://example.org",
  VERCEL_ENV: "production",
  NODE_ENV: "production",
};

describe("notifyRuntimeOf in production", () => {
  it("is on only for a production deployment with sign-in on", () => {
    const runtime = notifyRuntimeOf(full);
    expect(runtime.kind).toBe("on");
    expect(runtime.kind === "on" && runtime.context.baseURL).toBe("https://example.org");
    expect(runtime.kind === "on" && runtime.eventCap).toBe(DEFAULT_DAILY_EVENT_CAP);
  });

  it("is off for a preview, an unidentified environment and an unknown one", () => {
    for (const VERCEL_ENV of ["preview", undefined, "", "staging"]) {
      expect(notifyRuntimeOf({ ...full, VERCEL_ENV }).kind, String(VERCEL_ENV)).toBe("off");
    }
  });

  it("is off while sign-in is off: no provider key, a wrong origin, a short secret", () => {
    expect(notifyRuntimeOf({ ...full, RESEND_API_KEY: undefined }).kind).toBe("off");
    expect(notifyRuntimeOf({ ...full, BETTER_AUTH_URL: "https://elsewhere.example" }).kind).toBe(
      "off",
    );
    expect(notifyRuntimeOf({ ...full, BETTER_AUTH_SECRET: "short" }).kind).toBe("off");
  });
});

describe("notifyRuntimeOf outside production", () => {
  it("needs BETTER_AUTH_URL and never reaches a provider", () => {
    expect(notifyRuntimeOf({ NODE_ENV: "development" }).kind).toBe("off");
    const dev = notifyRuntimeOf({ NODE_ENV: "development", BETTER_AUTH_URL: "http://localhost" });
    expect(dev.kind).toBe("on");
    expect(dev.kind === "on" && dev.mail.refuseCopyPending).toBe(false);
  });
});

describe("eventCapOf", () => {
  const lines = () => {
    const seen: string[] = [];
    return { seen, log: (line: string) => seen.push(line) };
  };

  it("is 40 unset, and the positive integer when one is set", () => {
    expect(DEFAULT_DAILY_EVENT_CAP).toBe(40);
    expect(eventCapOf({})).toBe(40);
    expect(eventCapOf({ NOTIFICATION_DAILY_EVENT_CAP: "" })).toBe(40);
    expect(eventCapOf({ NOTIFICATION_DAILY_EVENT_CAP: "25" })).toBe(25);
    expect(eventCapOf({ NOTIFICATION_DAILY_EVENT_CAP: " 7 " })).toBe(7);
  });

  it("falls back to 40 on a bad value, with one line that never shows the value", () => {
    const { seen, log } = lines();
    for (const bad of ["0", "-3", "4.5", "ten", "1e3", "99999999999999999999"]) {
      expect(eventCapOf({ NOTIFICATION_DAILY_EVENT_CAP: bad }, log), bad).toBe(40);
    }
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain("NOTIFICATION_DAILY_EVENT_CAP");
    expect(seen[0]).not.toMatch(/ten|99999/);
  });
});
