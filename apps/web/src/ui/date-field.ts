import type { CalendarDate } from "@opika/domain";

/**
 * `DateField`'s rules, pure: what three typed parts (day, month, year) say as a calendar date.
 * No zod and no runtime `@opika/domain` import, so the kit stays clear of the public-bundle guard
 * (`client-bundle-guard.test.ts`); `date-field.test.ts` pins the day check to `CalendarDateSchema`.
 */

/** What is typed: the day and year as digits, the month "" or "1"–"12" (the select's values). */
export type DateParts = { readonly day: string; readonly month: string; readonly year: string };

/** Why typed parts are not a date the field accepts. */
export type DateInvalidReason = "incomplete" | "no_such_date" | "before_min" | "after_max";

/** Nothing typed, a date the field accepts, or what was typed while it is not one. */
export type DateFieldValue =
  | { readonly kind: "empty" }
  | { readonly kind: "date"; readonly date: CalendarDate }
  | { readonly kind: "invalid"; readonly reason: DateInvalidReason; readonly parts: DateParts };

/** `today` is Kyiv's date on the caller's clock (`kyivCalendarDateOf(now)`), the latest accepted. */
export type DateBounds = { readonly today: CalendarDate; readonly min?: CalendarDate | undefined };

export const DAY_DIGITS = 2;
/** Four, so a five-digit year cannot be typed at all. */
export const YEAR_DIGITS = 4;

export const EMPTY_DATE: DateFieldValue = { kind: "empty" };

const NO_PARTS: DateParts = { day: "", month: "", year: "" };

/** A stored date, or none, as the field's value. */
export const dateValue = (date: CalendarDate | null): DateFieldValue =>
  date === null ? EMPTY_DATE : { kind: "date", date };

/** The parts a value shows: a date's day and month without a leading zero, as a person types them. */
export function datePartsOf(value: DateFieldValue): DateParts {
  switch (value.kind) {
    case "empty":
      return NO_PARTS;
    case "date": {
      const [year = "", month = "", day = ""] = value.date.split("-");
      return { day: String(Number(day)), month: String(Number(month)), year };
    }
    case "invalid":
      return value.parts;
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled kind; unreachable at runtime */
    default: {
      const unreachable: never = value;
      return unreachable;
    }
  }
}

/** `setUTCFullYear`, not `Date.UTC`: the latter reads years 0–99 as 1900–1999. */
const daysIn = (year: number, month: number): number => {
  const lastDay = new Date(0);
  lastDay.setUTCFullYear(year, month, 0);
  return lastDay.getUTCDate();
};

/** What the parts say, checked against the bounds (both edges inclusive). */
export function dateValueOfParts(parts: DateParts, bounds: DateBounds): DateFieldValue {
  const { day, month, year } = parts;
  if (day === "" && month === "" && year === "") return EMPTY_DATE;
  const invalid = (reason: DateInvalidReason): DateFieldValue => ({
    kind: "invalid",
    reason,
    parts,
  });
  if (!/^\d{1,2}$/.test(day) || !/^(?:0?[1-9]|1[0-2])$/.test(month) || !/^\d{4}$/.test(year)) {
    return invalid("incomplete");
  }
  const dayNumber = Number(day);
  if (dayNumber < 1 || dayNumber > daysIn(Number(year), Number(month))) {
    return invalid("no_such_date");
  }
  // ISO dates sort as strings in the order of the days they name.
  const date = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  if (bounds.min !== undefined && date < bounds.min) return invalid("before_min");
  if (date > bounds.today) return invalid("after_max");
  return { kind: "date", date };
}

/** Whether two values say the same thing: the same date, or the same parts typed. */
export function sameDateValue(a: DateFieldValue, b: DateFieldValue): boolean {
  if (a.kind === "date" && b.kind === "date") return a.date === b.date;
  if (a.kind === "invalid" && b.kind === "invalid") {
    return (
      a.reason === b.reason &&
      a.parts.day === b.parts.day &&
      a.parts.month === b.parts.month &&
      a.parts.year === b.parts.year
    );
  }
  return a.kind === b.kind;
}

/**
 * The twelve month names, January first, in the form a date takes after its day: in Ukrainian
 * the genitive, «5 листопада». From `Intl`, never a typed list.
 */
export function monthNamesOf(locale: string): readonly string[] {
  const format = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  return Array.from(
    { length: 12 },
    (_, index) =>
      format.formatToParts(new Date(Date.UTC(2000, index, 1))).find((part) => part.type === "month")
        ?.value ?? String(index + 1),
  );
}
