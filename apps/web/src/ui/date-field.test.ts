import { CalendarDateSchema, calendarDateYearsBefore } from "@opika/domain";
import { describe, expect, it } from "vitest";
import {
  type DateBounds,
  type DateParts,
  datePartsOf,
  dateValue,
  dateValueOfParts,
  EMPTY_DATE,
  monthNamesOf,
  sameDateValue,
} from "./date-field";

/** Wide enough that only the calendar decides. */
const ANY_DAY: DateBounds = { today: "9999-12-31" };
const TODAY = "2026-11-12";
/** The animal form's own bounds: today in Kyiv, back to thirty years before it. */
const AGE: DateBounds = { today: TODAY, min: calendarDateYearsBefore(TODAY, 30) };

const parts = (day: string, month: string, year: string): DateParts => ({ day, month, year });

describe("monthNamesOf", () => {
  it("gives the twelve Ukrainian months in the genitive, January first", () => {
    expect(monthNamesOf("uk")).toEqual([
      "січня",
      "лютого",
      "березня",
      "квітня",
      "травня",
      "червня",
      "липня",
      "серпня",
      "вересня",
      "жовтня",
      "листопада",
      "грудня",
    ]);
  });
});

describe("dateValueOfParts", () => {
  it("nothing typed is empty, not a problem", () => {
    expect(dateValueOfParts(parts("", "", ""), ANY_DAY)).toEqual(EMPTY_DATE);
  });

  it.each([
    ["no day", parts("", "11", "2024")],
    ["no month", parts("5", "", "2024")],
    ["no year", parts("5", "11", "")],
    ["a three-digit year", parts("5", "11", "202")],
    ["a five-digit year", parts("5", "11", "20245")],
  ])("%s is incomplete", (_case, typed) => {
    expect(dateValueOfParts(typed, ANY_DAY)).toEqual({
      kind: "invalid",
      reason: "incomplete",
      parts: typed,
    });
  });

  it("reads a day and month with or without the leading zero", () => {
    expect(dateValueOfParts(parts("5", "11", "2024"), ANY_DAY)).toEqual(dateValue("2024-11-05"));
    expect(dateValueOfParts(parts("05", "11", "2024"), ANY_DAY)).toEqual(dateValue("2024-11-05"));
  });

  it.each([
    ["30 February", parts("30", "2", "2024")],
    ["31 April", parts("31", "4", "2025")],
    ["day 0", parts("0", "1", "2025")],
    ["day 32", parts("32", "1", "2025")],
  ])("refuses %s: no such date", (_case, typed) => {
    expect(dateValueOfParts(typed, ANY_DAY)).toMatchObject({
      kind: "invalid",
      reason: "no_such_date",
    });
  });

  it.each(["2024", "2000"])("accepts 29 February %s, a leap year", (year) => {
    expect(dateValueOfParts(parts("29", "2", year), ANY_DAY)).toEqual(dateValue(`${year}-02-29`));
  });

  it.each(["2023", "1900"])("refuses 29 February %s: not a leap year", (year) => {
    expect(dateValueOfParts(parts("29", "2", year), ANY_DAY)).toMatchObject({
      kind: "invalid",
      reason: "no_such_date",
    });
  });

  it("agrees with CalendarDateSchema on every day of four kinds of year", () => {
    for (const year of ["1600", "1900", "2000", "2023", "2024", "0004"]) {
      for (let month = 1; month <= 12; month += 1) {
        for (let day = 0; day <= 32; day += 1) {
          const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const value = dateValueOfParts(parts(String(day), String(month), year), ANY_DAY);
          expect(value.kind === "date", iso).toBe(CalendarDateSchema.safeParse(iso).success);
        }
      }
    }
  });

  it("the latest date is today, inclusive", () => {
    expect(dateValueOfParts(parts("12", "11", "2026"), AGE)).toEqual(dateValue(TODAY));
    expect(dateValueOfParts(parts("13", "11", "2026"), AGE)).toMatchObject({
      kind: "invalid",
      reason: "after_max",
    });
  });

  it("the earliest date is the minimum, inclusive", () => {
    expect(AGE.min).toBe("1996-11-12");
    expect(dateValueOfParts(parts("12", "11", "1996"), AGE)).toEqual(dateValue("1996-11-12"));
    expect(dateValueOfParts(parts("11", "11", "1996"), AGE)).toMatchObject({
      kind: "invalid",
      reason: "before_min",
    });
  });

  it("with no minimum, any year back is a date", () => {
    expect(dateValueOfParts(parts("1", "1", "1001"), { today: TODAY })).toEqual(
      dateValue("1001-01-01"),
    );
  });
});

describe("the round trip", () => {
  it.each(["2024-02-29", "2000-01-01", "1996-11-12", "2026-11-12", "2025-10-05"])(
    "%s: value in, parts, value out, unchanged",
    (iso) => {
      const shown = datePartsOf(dateValue(iso));
      expect(dateValueOfParts(shown, AGE)).toEqual(dateValue(iso));
    },
  );

  it("a date shows its day and month as typed, without a leading zero", () => {
    expect(datePartsOf(dateValue("2025-03-05"))).toEqual(parts("5", "3", "2025"));
  });

  it("what was typed stays as typed while it is not a date", () => {
    const typed = parts("31", "2", "2024");
    expect(datePartsOf(dateValueOfParts(typed, ANY_DAY))).toEqual(typed);
    expect(datePartsOf(EMPTY_DATE)).toEqual(parts("", "", ""));
  });
});

describe("sameDateValue", () => {
  it("compares the date, or the parts typed", () => {
    expect(sameDateValue(dateValue("2024-11-05"), dateValue("2024-11-05"))).toBe(true);
    expect(sameDateValue(dateValue("2024-11-05"), dateValue("2024-11-06"))).toBe(false);
    expect(sameDateValue(EMPTY_DATE, dateValue("2024-11-05"))).toBe(false);
    expect(sameDateValue(EMPTY_DATE, { kind: "empty" })).toBe(true);
    const typed = dateValueOfParts(parts("5", "", "2024"), ANY_DAY);
    expect(sameDateValue(typed, dateValueOfParts(parts("5", "", "2024"), ANY_DAY))).toBe(true);
    expect(sameDateValue(typed, dateValueOfParts(parts("6", "", "2024"), ANY_DAY))).toBe(false);
  });
});
