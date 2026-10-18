import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Kyiv's clock on a browser whose time-zone data predates the 2022 rename:
 * it knows `Europe/Kiev` only and throws a RangeError for `Europe/Kyiv`. S2's
 * success state formats the link's expiry in the browser, just after the
 * shelter was written, so it must fall back rather than fail. The fake throws
 * exactly what such a browser throws, and passes every other zone through.
 */
describe("on a browser that knows only Europe/Kiev", () => {
  class OldZoneDataFormat extends Intl.DateTimeFormat {
    constructor(locales?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions) {
      if (options?.timeZone === "Europe/Kyiv") {
        throw new RangeError("Invalid time zone specified: Europe/Kyiv");
      }
      super(locales, options);
    }
  }

  const realDateTimeFormat = Intl.DateTimeFormat;
  const install = (format: typeof Intl.DateTimeFormat) =>
    Object.defineProperty(Intl, "DateTimeFormat", {
      value: format,
      writable: true,
      configurable: true,
    });

  beforeEach(() => {
    // Fresh modules, so the lazily built formatters are built under the fake.
    vi.resetModules();
    install(OldZoneDataFormat as unknown as typeof Intl.DateTimeFormat);
  });

  afterEach(() => {
    install(realDateTimeFormat);
  });

  it("the fake refuses the new name, as such a browser does", () => {
    expect(() => new Intl.DateTimeFormat("uk-UA", { timeZone: "Europe/Kyiv" })).toThrow(RangeError);
  });

  it("S2's expiry line still reads the day and time in Kyiv", async () => {
    const { kyivDateAndTime } = await import("./create/create-outcome");
    // 08:04 UTC on 16 October is 11:04 in Kyiv (summer time, UTC+3).
    expect(kyivDateAndTime(new Date("2026-10-16T08:04:00.000Z"))).toEqual({
      date: "16 жовтня",
      time: "11:04",
    });
    // 22:30 UTC on 1 December is already 2 December, 00:30, in Kyiv (UTC+2).
    expect(kyivDateAndTime(new Date("2026-12-01T22:30:00.000Z"))).toEqual({
      date: "2 грудня",
      time: "00:30",
    });
  });

  it("the operator's other moments too", async () => {
    const { formatDateTime, formatTime } = await import("./format");
    const instant = new Date("2026-10-16T08:04:00.000Z");
    expect(formatTime(instant)).toBe("11:04");
    // The joiner between the date and the time is ICU's choice and varies by version.
    expect(formatDateTime(instant)).toMatch(/^16 жовтня 2026 .*11:04$/);
  });
});
