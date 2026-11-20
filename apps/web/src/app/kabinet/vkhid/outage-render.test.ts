import { inspect } from "node:util";
import { setupTestDatabase, truncateAll } from "@opika/db/test";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { RateLimiter } from "../../../api/rate-limit";
import { unreachableLimiter } from "../../../api/test-outage";
import { createKabinetAuth, type KabinetAuth } from "../../../kabinet/auth";
import { capturingSender } from "../../../kabinet/magic-link-sender";
import { generousPasswordLimiters } from "../../../kabinet/password-limits";
import { capturingPasswordMail } from "../../../kabinet/password-mail";

/**
 * Owner, 2026-11-20: "During an outage, GET of the /kabinet/vkhid pages (sign-in, forgot password,
 * new password) loads". The proxy lets them through (`page-limit.test.ts`, `proxy.test.ts`); this is
 * the pages themselves rendering with the limiter store unreachable. The sign-in page reads the
 * session through `auth.api.getSession` with no request, so `hooks.before` charges no limiter
 * (`LIMITED_AUTH_PATHS` needs `ctx.request`). A refactor that passed the request would charge the
 * unreachable per-IP limiter here and refuse the page: the counters below go red first.
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;
let auth: KabinetAuth;
let asked: string[];

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("../../../features/chrome/kabinet-signed-in", () => ({
  kabinetSessionCookiePresent: async () => false,
}));
vi.mock("../../../api/db", () => ({ getDb: () => db }));
vi.mock("../../../kabinet/runtime", () => ({ kabinetAuth: () => auth }));

/** The served modes on a store that's down, recording every time one is asked. */
const counted = (name: string, onUnavailable: "allow" | "deny"): RateLimiter => {
  const inner = unreachableLimiter(onUnavailable);
  return {
    check: async (key, now) => {
      asked.push(name);
      return inner.check(key, now);
    },
    attempt: async (key, now) => {
      asked.push(name);
      return (await inner.attempt?.(key, now)) ?? "unavailable";
    },
  };
};

const { default: SignInPage } = await import("./page");
const { default: ForgotPasswordPage } = await import("./zabuly/page");
const { default: ResetPasswordPage } = await import("./novyi-parol/page");

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

beforeEach(async () => {
  vi.stubEnv("BETTER_AUTH_SECRET", "s".repeat(32));
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  await truncateAll(db);
  asked = [];
  auth = createKabinetAuth({
    db,
    sender: capturingSender(),
    schedule: () => {},
    baseURL: "http://localhost:3000",
    secret: "test-only-secret-that-is-long-enough-0123456789",
    secureCookies: false,
    passwordLimiters: generousPasswordLimiters(),
    passwordMail: capturingPasswordMail(),
    limiters: { perUser: counted("perUser", "allow"), perIp: counted("perIp", "deny") },
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const text = (tree: unknown) => inspect(tree, { depth: null });

describe("the sign-in pages with the limiter store unreachable", () => {
  it("/kabinet/vkhid renders the sign-in form, and its session read asks no limiter", async () => {
    const tree = await SignInPage({ searchParams: Promise.resolve({}) });
    expect(text(tree)).toContain("SignInCard");
    expect(asked).toEqual([]);
  });

  it("/kabinet/vkhid/zabuly renders «Забули пароль?»", async () => {
    const tree = await ForgotPasswordPage();
    expect(text(tree)).toContain("ForgotPasswordCard");
    expect(asked).toEqual([]);
  });

  it("/kabinet/vkhid/novyi-parol renders the new-password form", async () => {
    const tree = await ResetPasswordPage({ searchParams: Promise.resolve({ token: "t" }) });
    expect(text(tree)).toContain("ResetPasswordCard");
    expect(asked).toEqual([]);
  });

  it("the pin works: a session read that carried the request would ask the per-IP limiter and be refused", async () => {
    const request = new Request("http://localhost:3000/api/auth/get-session", {
      headers: { origin: "http://localhost:3000", "x-forwarded-for": "203.0.113.60" },
    });
    const response = await auth.handler(request);
    expect(response.status).toBe(429);
    expect(asked).toEqual(["perIp"]);
  });
});
