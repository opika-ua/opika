import { z } from "zod";

/**
 * A calendar date with no time of day (`YYYY-MM-DD`): what a date input
 * yields, and what a person means by "the day it arrived". Kept as a string
 * at the boundary so no time zone can shift it by a day on the way in.
 */
export const CalendarDateSchema = z.iso.date();
export type CalendarDate = z.infer<typeof CalendarDateSchema>;

/**
 * The day the people using the site live in. Every shelter is in one
 * Ukrainian oblast, so "today" and "in the future" are Kyiv's calendar, not
 * UTC's: at 01:00 in Kyiv the UTC date is still yesterday.
 */
export const KYIV_TIME_ZONE = "Europe/Kyiv";

let kyivDateFormat: Intl.DateTimeFormat | undefined;

/**
 * Kyiv's year, month and day of an instant, read by `calendarDateFromParts`.
 * Built on first use, not at module load, because this module ships in the
 * kabinet's client bundle: a browser whose time-zone data predates the 2022
 * rename knows only `Europe/Kiev` and would throw while loading the module.
 * The two names are the same zone.
 */
const kyivFormat = (): Intl.DateTimeFormat => {
  if (kyivDateFormat === undefined) {
    const options = { year: "numeric", month: "2-digit", day: "2-digit" } as const;
    try {
      kyivDateFormat = new Intl.DateTimeFormat("en-CA", { ...options, timeZone: KYIV_TIME_ZONE });
    } catch {
      kyivDateFormat = new Intl.DateTimeFormat("en-CA", { ...options, timeZone: "Europe/Kiev" });
    }
  }
  return kyivDateFormat;
};

/**
 * The ISO date (`YYYY-MM-DD`) a formatter's year, month and day parts name.
 * Never `format()`'s string: that follows the locale's pattern, which ICU
 * versions have changed (`en-CA` among them), and this runs in whatever
 * browser opens the form.
 */
export const calendarDateFromParts = (
  format: Pick<Intl.DateTimeFormat, "formatToParts">,
  instant: Date,
): CalendarDate => {
  const parts = format.formatToParts(instant);
  const part = (type: "year" | "month" | "day", length: number): string => {
    const value = parts.find((candidate) => candidate.type === type)?.value;
    if (value === undefined) throw new Error(`The formatted date has no ${type}`);
    return value.padStart(length, "0");
  };
  return `${part("year", 4)}-${part("month", 2)}-${part("day", 2)}`;
};

/** The calendar date an instant falls on in Kyiv. */
export const kyivCalendarDateOf = (instant: Date): CalendarDate =>
  calendarDateFromParts(kyivFormat(), instant);

/**
 * The instant a calendar date from the form is stored as: UTC midnight of
 * that date. Not every stored instant is one (seeded birth dates carry a time
 * of day), so a stored instant is read back as a date through
 * `kyivCalendarDateOf`. UTC midnight's Kyiv date is the same date (Kyiv is
 * ahead of UTC all year), so `kyivCalendarDateOf` gives this one back
 * unchanged.
 */
export const instantOfCalendarDate = (date: CalendarDate): Date =>
  new Date(`${date}T00:00:00.000Z`);

/**
 * The same day `years` years earlier, as a date string. Compared as a string
 * against other ISO dates, which sort like the dates they name, so a 29
 * February with no counterpart (`1998-02-29`) still bounds correctly: the
 * 28th falls before it, the 1st of March after.
 */
export const calendarDateYearsBefore = (date: CalendarDate, years: number): string => {
  const [year, rest] = [date.slice(0, 4), date.slice(4)];
  return `${String(Number(year) - years).padStart(4, "0")}${rest}`;
};
