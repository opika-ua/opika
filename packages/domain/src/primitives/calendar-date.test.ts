import { describe, expect, it, vi } from "vitest";
import { calendarDateFromParts, instantOfCalendarDate, kyivCalendarDateOf } from "./calendar-date";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Review finding 3 (K3): the date is read from the formatter's parts, so a
 * browser whose ICU formats the locale with another pattern still gets the
 * ISO date. Before, `format()` was trusted to print `YYYY-MM-DD`, and where
 * it didn't, every date compared as later than today.
 */
describe("calendarDateFromParts", () => {
  it("reads a formatter whose format() isn't ISO but whose parts are right", () => {
    const instant = new Date("2026-10-16T21:30:00.000Z");
    const usKyiv = new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Kyiv",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    // The premise: this formatter's own string is not an ISO date.
    expect(usKyiv.format(instant)).not.toMatch(ISO_DATE);
    expect(calendarDateFromParts(usKyiv, instant)).toBe("2026-10-17");

    const dayFirstDotted = {
      format: () => "17.10.2026",
      formatToParts: (): Intl.DateTimeFormatPart[] => [
        { type: "day", value: "17" },
        { type: "literal", value: "." },
        { type: "month", value: "10" },
        { type: "literal", value: "." },
        { type: "year", value: "2026" },
      ],
    };
    expect(calendarDateFromParts(dayFirstDotted, instant)).toBe("2026-10-17");
  });

  it("refuses parts with no day rather than print a date that isn't one", () => {
    const noDay = {
      formatToParts: (): Intl.DateTimeFormatPart[] => [
        { type: "month", value: "10" },
        { type: "year", value: "2026" },
      ],
    };
    expect(() => calendarDateFromParts(noDay, new Date())).toThrow(/no day/);
  });
});

describe("kyivCalendarDateOf", () => {
  it("is Kyiv's calendar day, not UTC's, either side of midnight and in both offsets", () => {
    // October 2026: UTC+3 until the 25th.
    expect(kyivCalendarDateOf(new Date("2026-10-16T20:59:00.000Z"))).toBe("2026-10-16");
    expect(kyivCalendarDateOf(new Date("2026-10-16T21:30:00.000Z"))).toBe("2026-10-17");
    // January: UTC+2.
    expect(kyivCalendarDateOf(new Date("2026-01-15T21:59:00.000Z"))).toBe("2026-01-15");
    expect(kyivCalendarDateOf(new Date("2026-01-15T22:30:00.000Z"))).toBe("2026-01-16");
  });

  /** Review finding 2: a seeded birth date carries a time of day, not UTC midnight. */
  it("reads a stored instant that isn't UTC midnight as its Kyiv date", () => {
    expect(kyivCalendarDateOf(new Date("2020-11-22T20:44:04.446Z"))).toBe("2020-11-22");
    expect(kyivCalendarDateOf(instantOfCalendarDate("2020-11-22"))).toBe("2020-11-22");
  });

  it("still gives the ISO date where the runtime's en-CA pattern isn't ISO", async () => {
    const Real = Intl.DateTimeFormat;
    class NonIsoPattern extends Real {
      override format(): string {
        return "10/17/2026";
      }
    }
    Object.defineProperty(Intl, "DateTimeFormat", { value: NonIsoPattern });
    try {
      // A fresh module: the formatter is built on first use and kept.
      vi.resetModules();
      const fresh = await import("./calendar-date");
      expect(fresh.kyivCalendarDateOf(new Date("2026-10-16T21:30:00.000Z"))).toBe("2026-10-17");
    } finally {
      Object.defineProperty(Intl, "DateTimeFormat", { value: Real });
      vi.resetModules();
    }
  });
});
