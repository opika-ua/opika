import { KABINET_SESSION_LIMITS } from "@opika/db/repos";
import { describe, expect, it, vi } from "vitest";
import { sessionHasLapsed, sessionLapsedFor } from "./session-lapse";

/**
 * The limits by role (F-B9; §9 answers 3 and 6), written out here rather than read from the
 * constant: a shelter-side session 30 days idle and 90 at most, the operator's 7 and 30.
 */
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-20T12:00:00.000Z");
const times = (createdAgo: number, updatedAgo: number) => ({
  createdAt: new Date(NOW.getTime() - createdAgo),
  updatedAt: new Date(NOW.getTime() - updatedAgo),
});

describe("sessionLapsedFor", () => {
  it.each([
    ["shelter_side", 30 * DAY, 90 * DAY],
    ["operator", 7 * DAY, 30 * DAY],
  ] as const)(
    "%s: lives up to %i ms idle and %i ms old, lapses a millisecond past either",
    (holder, idle, cap) => {
      expect(sessionLapsedFor(times(DAY, idle), holder, NOW)).toBe(false);
      expect(sessionLapsedFor(times(DAY, idle + 1), holder, NOW)).toBe(true);
      expect(sessionLapsedFor(times(cap, 0), holder, NOW)).toBe(false);
      expect(sessionLapsedFor(times(cap + 1, 0), holder, NOW)).toBe(true);
    },
  );

  it("the operator's limits are the shorter in both dimensions (sessionHasLapsed relies on it)", () => {
    const { operator, shelterAdmin } = KABINET_SESSION_LIMITS;
    expect(operator.idleMs).toBeLessThan(shelterAdmin.idleMs);
    expect(operator.absoluteMs).toBeLessThan(shelterAdmin.absoluteMs);
  });
});

describe("sessionHasLapsed: who holds it is asked only when it decides", () => {
  it("in daily use: live, and no role lookup", async () => {
    const isOperator = vi.fn(async () => true);
    expect(await sessionHasLapsed(times(2 * DAY, 60_000), NOW, isOperator)).toBe(false);
    expect(isOperator).not.toHaveBeenCalled();
  });

  it("past the shelter admin's limits: dead for anyone, no lookup", async () => {
    const isOperator = vi.fn(async () => false);
    expect(await sessionHasLapsed(times(91 * DAY, 60_000), NOW, isOperator)).toBe(true);
    expect(isOperator).not.toHaveBeenCalled();
  });

  it("in between: dead exactly when the holder is the operator", async () => {
    const between = times(40 * DAY, 10 * DAY);
    expect(await sessionHasLapsed(between, NOW, async () => true)).toBe(true);
    expect(await sessionHasLapsed(between, NOW, async () => false)).toBe(false);
  });
});
