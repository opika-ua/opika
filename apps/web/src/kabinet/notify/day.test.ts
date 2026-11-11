import { describe, expect, it } from "vitest";
import { kyivDayStartOf } from "./day";

describe("kyivDayStartOf", () => {
  it("is 22:00 UTC the evening before in winter (UTC+2)", () => {
    expect(kyivDayStartOf(new Date("2026-11-10T06:00:00.000Z")).toISOString()).toBe(
      "2026-11-09T22:00:00.000Z",
    );
    expect(kyivDayStartOf(new Date("2026-11-10T21:59:59.999Z")).toISOString()).toBe(
      "2026-11-09T22:00:00.000Z",
    );
    expect(kyivDayStartOf(new Date("2026-11-10T22:00:00.000Z")).toISOString()).toBe(
      "2026-11-10T22:00:00.000Z",
    );
  });

  it("is 21:00 UTC the evening before in summer (UTC+3)", () => {
    expect(kyivDayStartOf(new Date("2026-07-15T12:00:00.000Z")).toISOString()).toBe(
      "2026-07-14T21:00:00.000Z",
    );
  });

  it("finds the right midnight on the days the clocks change", () => {
    // 2026-03-29 and 2026-10-25 are the last Sundays of March and October.
    expect(kyivDayStartOf(new Date("2026-03-29T12:00:00.000Z")).toISOString()).toBe(
      "2026-03-28T22:00:00.000Z",
    );
    expect(kyivDayStartOf(new Date("2026-10-25T12:00:00.000Z")).toISOString()).toBe(
      "2026-10-24T21:00:00.000Z",
    );
  });
});
