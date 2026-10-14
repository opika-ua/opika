import { describe, expect, it } from "vitest";
import {
  assertBuildEnv,
  CRON_SECRET_MIN_LENGTH,
  cronSecretProblem,
  rateLimitKeySecretProblem,
} from "./build-env";

/**
 * `assertBuildEnv` is what `next.config.ts` runs when a build loads it (KH-T6:
 * "a production build fails without CRON_SECRET ≥32 chars"). Plain objects
 * stand in for the build's environment; nothing here reads `process.env`.
 */
const R2 = { NEXT_PUBLIC_R2_PUBLIC_BASE_URL: "https://cdn.example.test" };
/** The other production-only secret, valid, so a CRON_SECRET case tests only CRON_SECRET. */
const RATE_KEY = { RATE_LIMIT_KEY_SECRET: "r".repeat(32) };
// A recognisable value, so a test can show it never reaches the message.
const SHORT_SECRET = "short-secret-value-0123456789ab"; // 31 characters

describe("assertBuildEnv: CRON_SECRET on a production build", () => {
  it("the fixture is one under the floor, and the floor is 32", () => {
    expect(SHORT_SECRET).toHaveLength(31);
    expect(CRON_SECRET_MIN_LENGTH).toBe(32);
  });

  it("fails a production build with no CRON_SECRET, naming the variable", () => {
    expect(() => assertBuildEnv({ VERCEL: "1", VERCEL_ENV: "production", ...R2 })).toThrow(
      /CRON_SECRET must be at least 32 characters/,
    );
  });

  it("fails one with an empty CRON_SECRET", () => {
    expect(() =>
      assertBuildEnv({ VERCEL: "1", VERCEL_ENV: "production", CRON_SECRET: "", ...R2 }),
    ).toThrow(/CRON_SECRET/);
  });

  it("fails one with a 31-character CRON_SECRET, and never prints the value", () => {
    let message = "";
    try {
      assertBuildEnv({ VERCEL: "1", VERCEL_ENV: "production", CRON_SECRET: SHORT_SECRET, ...R2 });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/CRON_SECRET must be at least 32 characters/);
    expect(message).not.toContain(SHORT_SECRET);
    expect(message).not.toContain(SHORT_SECRET.slice(0, 8));
  });

  it("builds with exactly 32 characters", () => {
    expect(() =>
      assertBuildEnv({
        VERCEL: "1",
        VERCEL_ENV: "production",
        CRON_SECRET: `${SHORT_SECRET}c`,
        ...RATE_KEY,
        ...R2,
      }),
    ).not.toThrow();
  });

  it("names both problems at once when R2 is missing as well", () => {
    expect(() => assertBuildEnv({ VERCEL: "1", VERCEL_ENV: "production" })).toThrow(
      /NEXT_PUBLIC_R2_PUBLIC_BASE_URL[\s\S]*CRON_SECRET/,
    );
  });

  it.each([
    ["a Preview build", { VERCEL: "1", VERCEL_ENV: "preview", ...R2 }],
    ["a development build on Vercel", { VERCEL: "1", VERCEL_ENV: "development", ...R2 }],
    ["a local or CI build (no VERCEL_ENV)", {}],
    ["NODE_ENV=production alone (every next build sets it)", { NODE_ENV: "production" }],
  ])("leaves %s alone without CRON_SECRET", (_label, env) => {
    expect(() => assertBuildEnv(env)).not.toThrow();
    expect(cronSecretProblem(env)).toBeNull();
  });
});

describe("assertBuildEnv: NEXT_PUBLIC_R2_PUBLIC_BASE_URL (moved here from next.config.ts)", () => {
  it.each([
    ["VERCEL", { VERCEL: "1" }],
    ["VERCEL_ENV=preview", { VERCEL_ENV: "preview" }],
  ])("fails any Vercel build without it (%s)", (_label, env) => {
    expect(() => assertBuildEnv(env)).toThrow(
      /Missing required environment variable: NEXT_PUBLIC_R2_PUBLIC_BASE_URL/,
    );
  });

  it("does not require it of a local build", () => {
    expect(() => assertBuildEnv({})).not.toThrow();
  });
});

/**
 * EM-Q11 (Oleksii, 2026-10-14, verbatim): "Required in production with a
 * build-time check, like CRON_SECRET." The same shared rule, so the same
 * cases, with `CRON_SECRET` valid throughout so each case tests only this one.
 */
describe("assertBuildEnv: RATE_LIMIT_KEY_SECRET on a production build", () => {
  const CRON = { CRON_SECRET: "c".repeat(32) };
  const production = { VERCEL: "1", VERCEL_ENV: "production", ...R2, ...CRON };

  it("fails a production build without it, naming the variable", () => {
    expect(() => assertBuildEnv(production)).toThrow(
      /RATE_LIMIT_KEY_SECRET must be at least 32 characters/,
    );
  });

  it("fails one with 31 characters, and never prints the value", () => {
    let message = "";
    try {
      assertBuildEnv({ ...production, RATE_LIMIT_KEY_SECRET: SHORT_SECRET });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/RATE_LIMIT_KEY_SECRET must be at least 32 characters/);
    expect(message).not.toContain(SHORT_SECRET.slice(0, 8));
  });

  it("builds with exactly 32 characters", () => {
    expect(() =>
      assertBuildEnv({ ...production, RATE_LIMIT_KEY_SECRET: `${SHORT_SECRET}c` }),
    ).not.toThrow();
  });

  it("names both secrets at once when both are missing", () => {
    expect(() => assertBuildEnv({ VERCEL: "1", VERCEL_ENV: "production", ...R2 })).toThrow(
      /CRON_SECRET[\s\S]*RATE_LIMIT_KEY_SECRET/,
    );
  });

  it.each([
    ["a Preview build", { VERCEL: "1", VERCEL_ENV: "preview", ...R2 }],
    ["a local or CI build (no VERCEL_ENV)", {}],
    ["NODE_ENV=production alone (every next build sets it)", { NODE_ENV: "production" }],
  ])("leaves %s alone without it", (_label, env) => {
    expect(() => assertBuildEnv(env)).not.toThrow();
    expect(rateLimitKeySecretProblem(env)).toBeNull();
  });
});
