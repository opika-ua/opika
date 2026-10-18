import { KYIV_TIME_ZONE } from "@opika/domain";

/**
 * Dates and times on the operator's pages: native `Intl`, never a hand-rolled
 * month list (standing rule), in Kyiv time, so a date is the day it was in
 * Ukraine whatever zone the server renders in. `formatDate` is the profile's
 * own (`ProfileParts`), re-exported so both read the same day.
 */
export { formatDate } from "../ProfileParts";

type KyivFormatOptions = Omit<Intl.DateTimeFormatOptions, "timeZone">;

/**
 * A Ukrainian formatter on Kyiv's clock. S2's success state runs these in the
 * browser, and a browser whose time-zone data predates the 2022 rename knows
 * only `Europe/Kiev`: asked for `Europe/Kyiv` it throws, which would break the
 * page just after the shelter was written. The two names are the same zone;
 * `@opika/domain`'s `kyivCalendarDateOf` falls back the same way.
 */
export function kyivDateTimeFormat(options: KyivFormatOptions): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat("uk-UA", { ...options, timeZone: KYIV_TIME_ZONE });
  } catch {
    return new Intl.DateTimeFormat("uk-UA", { ...options, timeZone: "Europe/Kiev" });
  }
}

/**
 * Built on first use, not at module load: a module that throws while loading
 * takes the whole page with it, the fallback above included.
 */
const lazyFormat = (options: KyivFormatOptions) => {
  let format: Intl.DateTimeFormat | undefined;
  return (date: Date): string => {
    format ??= kyivDateTimeFormat(options);
    return format.format(date);
  };
};

/** HH:mm, Kyiv. */
export const formatTime = lazyFormat({ hour: "2-digit", minute: "2-digit" });

/** «16 жовтня», Kyiv: a day within the next few, where the year goes without saying. */
export const formatDayMonth = lazyFormat({ day: "numeric", month: "long" });

/** A history line's moment: the day and the time, Kyiv. */
export const formatDateTime = lazyFormat({
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
