import { describe, expect, it } from "vitest";
import { nearCapAt, nearCapDedupKey } from "./cap-alarm";
import { DEFAULT_DAILY_EVENT_CAP } from "./runtime";

describe("nearCapAt", () => {
  it("is 240 of the default 300", () => {
    expect(nearCapAt(DEFAULT_DAILY_EVENT_CAP)).toBe(240);
  });

  it("rounds up, and is never past the cap or below 1", () => {
    expect(nearCapAt(10)).toBe(8);
    expect(nearCapAt(3)).toBe(3);
    expect(nearCapAt(1)).toBe(1);
  });
});

describe("nearCapDedupKey", () => {
  it("names the Kyiv day, not the UTC one", () => {
    // 22:30 UTC on the 10th is 00:30 on the 11th in Kyiv.
    expect(nearCapDedupKey(new Date("2026-11-10T22:30:00.000Z"))).toBe(
      "notification_cap_warning:2026-11-11",
    );
    expect(nearCapDedupKey(new Date("2026-11-10T21:30:00.000Z"))).toBe(
      "notification_cap_warning:2026-11-10",
    );
  });
});
