import { kyivCalendarDateOf } from "@opika/domain";

/**
 * The first instant of the Kyiv day `now` falls in. Kyiv is UTC+2 or UTC+3, so the midnight is
 * one of two instants; the one whose own Kyiv date is today and whose millisecond before is not.
 */
export function kyivDayStartOf(now: Date): Date {
  const day = kyivCalendarDateOf(now);
  for (const offset of ["+02:00", "+03:00"]) {
    const start = new Date(`${day}T00:00:00${offset}`);
    if (
      kyivCalendarDateOf(start) === day &&
      kyivCalendarDateOf(new Date(start.getTime() - 1)) !== day
    ) {
      return start;
    }
  }
  throw new Error(`No Kyiv midnight found for ${day}`);
}

/**
 * The ISO 8601 week the Kyiv day of `now` falls in, as `2026-W46`: weeks start on Monday and
 * week 1 holds the year's first Thursday, so the year of a week can differ from its dates'.
 */
export function kyivIsoWeekOf(now: Date): string {
  const [year, month, day] = kyivCalendarDateOf(now)
    .split("-")
    .map((part) => Number(part));
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  // Shift to the Thursday of this ISO week: its year is the week's year.
  const dayOfWeek = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + 4 - dayOfWeek);
  const firstOfYear = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((date.getTime() - firstOfYear) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
