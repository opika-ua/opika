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
