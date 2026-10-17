import { describe, expect, it } from "vitest";
import { inMemoryRateLimiter } from "../api/rate-limit";
import { capturingInvitationSender } from "./email-senders";
import { isChargedKabinetPageLoad, isKabinetPagePath, kabinetPageLoadAllowed } from "./page-limit";
import { KABINET_RATE_LIMITS, type KabinetLimiters } from "./rate-limits";
import { handleKabinetRpc } from "./rpc-route";

/**
 * KH-Q8 (KS-Q3): `/kabinet` page loads draw on the kabinet API's limiters.
 * Real in-memory limiters with the real HS-Q10 numbers throughout: no
 * limiter here answers a constant.
 */

const NOW = new Date("2026-10-14T10:00:00Z");

const realLimiters = (): KabinetLimiters => ({
  perUser: inMemoryRateLimiter(KABINET_RATE_LIMITS.perUser),
  perIp: inMemoryRateLimiter(KABINET_RATE_LIMITS.perIp),
});

/** Loads one page `times` times and returns the last answer. */
async function load(
  limiters: KabinetLimiters,
  times: number,
  request: { ip: string; userId: string | null },
): Promise<boolean> {
  let allowed = true;
  for (let i = 0; i < times; i++) {
    allowed = await kabinetPageLoadAllowed(
      limiters,
      { ip: request.ip, userId: async () => request.userId },
      NOW,
    );
  }
  return allowed;
}

describe("which paths are kabinet pages", () => {
  it("is /kabinet and everything under it, not the API or a lookalike", () => {
    expect(isKabinetPagePath("/kabinet")).toBe(true);
    expect(isKabinetPagePath("/kabinet/vkhid")).toBe(true);
    expect(isKabinetPagePath("/kabinet/anything-added-later")).toBe(true);
    expect(isKabinetPagePath("/api/kabinet/shelter/profile/get")).toBe(false);
    expect(isKabinetPagePath("/kabinetx")).toBe(false);
  });
});

describe("which kabinet requests the proxy charges as page loads", () => {
  it("every page load, but not the confirm POST, which Better Auth's hooks.before charges", () => {
    expect(isChargedKabinetPageLoad("GET", "/kabinet")).toBe(true);
    expect(isChargedKabinetPageLoad("GET", "/kabinet/vkhid/pidtverdzhennia")).toBe(true);
    // The invite landing's server action posts to its page: charged here (and on signInLimiters).
    expect(isChargedKabinetPageLoad("POST", "/kabinet/vkhid")).toBe(true);
    expect(isChargedKabinetPageLoad("POST", "/kabinet/vkhid/pidtverdzhennia")).toBe(false);
    expect(isChargedKabinetPageLoad("POST", "/api/kabinet/shelter/profile/get")).toBe(false);
  });
});

describe("the per-IP budget (300 a minute, HS-Q10)", () => {
  it("lets the 300th anonymous load through and refuses the 301st", async () => {
    const limiters = realLimiters();
    expect(await load(limiters, 300, { ip: "198.51.100.1", userId: null })).toBe(true);
    expect(await load(limiters, 1, { ip: "198.51.100.1", userId: null })).toBe(false);
    // Another address is untouched.
    expect(await load(limiters, 1, { ip: "198.51.100.2", userId: null })).toBe(true);
  });

  it("reads no session for a caller already over it", async () => {
    const limiters = realLimiters();
    await load(limiters, 300, { ip: "198.51.100.3", userId: null });
    let sessionReads = 0;
    const allowed = await kabinetPageLoadAllowed(
      limiters,
      {
        ip: "198.51.100.3",
        userId: async () => {
          sessionReads += 1;
          return "user-1";
        },
      },
      NOW,
    );
    expect(allowed).toBe(false);
    expect(sessionReads).toBe(0);
  });
});

describe("the per-user budget (100 a minute, HS-Q10)", () => {
  it("refuses the 101st load by one signed-in user, from any address", async () => {
    const limiters = realLimiters();
    expect(await load(limiters, 100, { ip: "198.51.100.10", userId: "user-1" })).toBe(true);
    // Same user, a fresh address: the user's budget is spent, not the address's.
    expect(await load(limiters, 1, { ip: "198.51.100.11", userId: "user-1" })).toBe(false);
    // Another user on the first address is untouched.
    expect(await load(limiters, 1, { ip: "198.51.100.10", userId: "user-2" })).toBe(true);
  });
});

describe("a page load and an API call share one allowance", () => {
  /**
   * The same limiter instances behind both, as `runtime.ts` wires them. The
   * API call is refused at the access middleware (a no_role caller), which
   * charges both budgets first and never touches the database.
   */
  async function apiCall(limiters: KabinetLimiters, ip: string, userId: string) {
    const response = await handleKabinetRpc(
      new Request("http://localhost/api/kabinet/shelter/profile/get", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ json: {} }),
      }),
      {
        availability: {
          kind: "available",
          sender: { send: async () => {} },
          invites: capturingInvitationSender(),
          secret: "x",
          baseURL: "http://localhost",
        },
        resolve: async () => ({
          principal: { kind: "no_role" },
          userId,
          db: {} as never,
          cursorSecret: "x",
        }),
        limiters,
        ip,
        now: NOW,
        newId: () => crypto.randomUUID(),
        operatorDisplayName: "Олексій",
        locationPolicy: null,
        production: false,
        shelterWrites: { kind: "refused_until_edit_screens" },
      },
    );
    return response.status;
  }

  it("100 API calls by a user leave their page load refused", async () => {
    const limiters = realLimiters();
    for (let i = 0; i < 100; i++) {
      expect(await apiCall(limiters, "198.51.100.20", "user-3")).toBe(403);
    }
    expect(await apiCall(limiters, "198.51.100.20", "user-3")).toBe(429);
    expect(await load(limiters, 1, { ip: "198.51.100.21", userId: "user-3" })).toBe(false);
  });

  it("300 page loads from an address leave its API calls refused", async () => {
    const limiters = realLimiters();
    await load(limiters, 300, { ip: "198.51.100.30", userId: null });
    expect(await apiCall(limiters, "198.51.100.30", "user-4")).toBe(429);
  });
});
