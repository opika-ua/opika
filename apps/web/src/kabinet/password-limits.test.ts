import { describe, expect, it } from "vitest";
import {
  chargeSignInAttempt,
  clearSignInAttempts,
  delayAfterAttemptMs,
  inMemoryDelayStore,
  PASSWORD_LIMITS,
  SIGN_IN_DELAY,
} from "./password-limits";

/**
 * §4.3's numbers, written out: «Забули пароль?» 20 an hour per IP and 3 per address, a reset's
 * POST 20 an hour per IP; the sign-in delay five free attempts in 15 minutes, then 1, 2, 4, 8,
 * then 15 minutes (the cap), no lockout, a success resets it. The clock is moved by hand: no
 * test here waits.
 */
const MINUTE = 60_000;
const KEY = "address:test-key";

describe("the password limits' numbers (§4.3)", () => {
  it("pins the budgets", () => {
    expect(PASSWORD_LIMITS).toEqual({
      forgotPerIp: { windowMs: 60 * MINUTE, maxRequests: 20 },
      forgotPerAddress: { windowMs: 60 * MINUTE, maxRequests: 3 },
      resetPerIp: { windowMs: 60 * MINUTE, maxRequests: 20 },
    });
    expect(SIGN_IN_DELAY).toEqual({
      freeAttempts: 5,
      windowMs: 15 * MINUTE,
      delaysMinutes: [1, 2, 4, 8, 15],
    });
  });

  it("the waits after each attempt: none for four, then 1, 2, 4, 8, 15, 15 … minutes", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 30].map((n) => delayAfterAttemptMs(n) / MINUTE)).toEqual(
      [0, 0, 0, 0, 1, 2, 4, 8, 15, 15, 15],
    );
  });
});

describe("chargeSignInAttempt", () => {
  it("lets five attempts through, then makes each further one wait, longer each time, never past 15 minutes", async () => {
    const store = inMemoryDelayStore();
    let now = new Date("2026-10-20T12:00:00.000Z");
    const attempt = () => chargeSignInAttempt(store, KEY, now);
    for (let i = 0; i < 5; i++) expect(await attempt()).toEqual({ kind: "allowed" });
    for (const minutes of [1, 2, 4, 8, 15, 15, 15]) {
      expect(await attempt()).toEqual({ kind: "wait", minutes });
      now = new Date(now.getTime() + minutes * MINUTE - 1);
      expect((await attempt()).kind, `a millisecond short of ${minutes}`).toBe("wait");
      now = new Date(now.getTime() + 1);
      expect(await attempt(), `after ${minutes}`).toEqual({ kind: "allowed" });
    }
  });

  it("rounds the minutes up, never to zero", async () => {
    const store = inMemoryDelayStore();
    const start = new Date("2026-10-20T12:00:00.000Z");
    for (let i = 0; i < 5; i++) await chargeSignInAttempt(store, KEY, start);
    expect(await chargeSignInAttempt(store, KEY, new Date(start.getTime() + 59_999))).toEqual({
      kind: "wait",
      minutes: 1,
    });
  });

  it("a refused attempt adds nothing: pressing while waiting doesn't lengthen the wait", async () => {
    const store = inMemoryDelayStore();
    let now = new Date("2026-10-20T12:00:00.000Z");
    for (let i = 0; i < 5; i++) await chargeSignInAttempt(store, KEY, now);
    for (let i = 0; i < 10; i++) {
      expect((await chargeSignInAttempt(store, KEY, now)).kind).toBe("wait");
    }
    now = new Date(now.getTime() + MINUTE);
    expect(await chargeSignInAttempt(store, KEY, now)).toEqual({ kind: "allowed" });
    // The sixth attempt went through; the next wait is the second step, 2 minutes.
    expect(await chargeSignInAttempt(store, KEY, now)).toEqual({ kind: "wait", minutes: 2 });
  });

  it("five attempts must fall within 15 minutes of the first to start the delays", async () => {
    const store = inMemoryDelayStore();
    let now = new Date("2026-10-20T12:00:00.000Z");
    for (let i = 0; i < 4; i++) await chargeSignInAttempt(store, KEY, now);
    now = new Date(now.getTime() + 15 * MINUTE);
    for (let i = 0; i < 4; i++) {
      expect(await chargeSignInAttempt(store, KEY, now)).toEqual({ kind: "allowed" });
    }
  });

  it("once delays have started, the count is forgotten 15 minutes after a wait ends with no attempt", async () => {
    const store = inMemoryDelayStore();
    let now = new Date("2026-10-20T12:00:00.000Z");
    for (let i = 0; i < 6; i++) await chargeSignInAttempt(store, KEY, now);
    // The sixth set a 1-minute wait; 15 minutes after it ends, nothing is left.
    now = new Date(now.getTime() + MINUTE + 15 * MINUTE + 1);
    for (let i = 0; i < 5; i++) {
      expect(await chargeSignInAttempt(store, KEY, now)).toEqual({ kind: "allowed" });
    }
  });

  it("a success clears the address: five free attempts again", async () => {
    const store = inMemoryDelayStore();
    const now = new Date("2026-10-20T12:00:00.000Z");
    for (let i = 0; i < 5; i++) await chargeSignInAttempt(store, KEY, now);
    await clearSignInAttempts(store, KEY, now);
    for (let i = 0; i < 5; i++) {
      expect(await chargeSignInAttempt(store, KEY, now)).toEqual({ kind: "allowed" });
    }
  });

  it("addresses don't share a count", async () => {
    const store = inMemoryDelayStore();
    const now = new Date("2026-10-20T12:00:00.000Z");
    for (let i = 0; i < 5; i++) await chargeSignInAttempt(store, KEY, now);
    expect(await chargeSignInAttempt(store, "address:another", now)).toEqual({ kind: "allowed" });
  });
});
