import { describe, expect, it } from "vitest";
import { inMemoryRateLimiter, type RateLimiter } from "../../api/rate-limit";
import {
  firstLimit,
  firstRefusal,
  mailCapKeyOf,
  REGISTRATION_LIMITS,
  REGISTRATION_MAIL_DAILY_CAP,
} from "./limits";

const HOUR = 60 * 60 * 1000;
const NOW = new Date("2026-11-18T21:30:00.000Z");

describe("self-registration's budgets (owner, 2026-11-18)", () => {
  it("are the owner's numbers", () => {
    expect(REGISTRATION_LIMITS).toEqual({
      perIpHour: { windowMs: HOUR, maxRequests: 5 },
      perIpDay: { windowMs: 24 * HOUR, maxRequests: 20 },
      perAddress: { windowMs: HOUR, maxRequests: 3 },
      citySearchPerIp: { windowMs: 60_000, maxRequests: 60 },
      resendPerUserHour: { windowMs: HOUR, maxRequests: 3 },
      resendPerUserDay: { windowMs: 24 * HOUR, maxRequests: 6 },
    });
    expect(REGISTRATION_MAIL_DAILY_CAP).toBe(300);
  });

  it("an hour's budget and a day's: either one refuses, and a refusal charges nothing after it", async () => {
    const hour = inMemoryRateLimiter({ windowMs: HOUR, maxRequests: 2 });
    const charged: string[] = [];
    const day: RateLimiter = {
      async check(key) {
        charged.push(key);
        return charged.length <= 1;
      },
    };
    expect(await firstRefusal([hour, day], "k", NOW)).toBeNull();
    // The day's budget is spent: the second try is refused by it.
    expect(await firstRefusal([hour, day], "k", NOW)).toBe(day);
    // The hour's is spent too now: refused there, the day's isn't asked.
    expect(await firstRefusal([hour, day], "k", NOW)).toBe(hour);
    expect(charged).toEqual(["k", "k"]);
  });

  it("firstLimit tells a limit reached from a store that's down, and charges nothing after either", async () => {
    const asked: string[] = [];
    const answering = (
      name: string,
      outcome: "allowed" | "refused" | "unavailable",
    ): RateLimiter => ({
      check: async () => outcome === "allowed",
      attempt: async () => {
        asked.push(name);
        return outcome;
      },
    });
    expect(
      await firstLimit([answering("a", "allowed"), answering("b", "allowed")], "k", NOW),
    ).toEqual({
      kind: "ok",
    });
    const spent = answering("c", "refused");
    expect(await firstLimit([spent, answering("d", "allowed")], "k", NOW)).toEqual({
      kind: "refused",
      by: spent,
    });
    expect(
      await firstLimit([answering("e", "unavailable"), answering("f", "allowed")], "k", NOW),
    ).toEqual({ kind: "unavailable" });
    expect(asked).toEqual(["a", "b", "c", "e"]);
  });

  it("the cap's key is the UTC day, so Kyiv's evening still counts towards the UTC date", () => {
    expect(mailCapKeyOf(NOW)).toBe("registration-mail:2026-11-18");
    expect(mailCapKeyOf(new Date("2026-11-19T00:00:00.000Z"))).toBe("registration-mail:2026-11-19");
  });
});
