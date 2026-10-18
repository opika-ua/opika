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
 * `en-CA` formats as `YYYY-MM-DD`, exactly the ISO calendar date. Built on
 * first use, not at module load, because this module ships in the kabinet's
 * client bundle: a browser whose time-zone data predates the 2022 rename
 * knows only `Europe/Kiev` and would throw while loading the module. The two
 * names are the same zone.
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

/** The calendar date an instant falls on in Kyiv. */
export const kyivCalendarDateOf = (instant: Date): CalendarDate => kyivFormat().format(instant);

/**
 * The instant a calendar date is stored as: UTC midnight of that date, the
 * convention every stored birth date already follows. Its Kyiv date is the
 * same date (Kyiv is ahead of UTC all year), so `kyivCalendarDateOf` gives
 * the date back unchanged.
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
