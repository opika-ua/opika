/**
 * Dates and times on the operator's pages: native `Intl`, never a hand-rolled
 * month list (standing rule), in Kyiv time, so a date is the day it was in
 * Ukraine whatever zone the server renders in. `formatDate` is the profile's
 * own (`ProfileParts`), re-exported so both read the same day.
 */
export { formatDate } from "../ProfileParts";

const TIME = new Intl.DateTimeFormat("uk-UA", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Kyiv",
});

const DATE_TIME = new Intl.DateTimeFormat("uk-UA", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Kyiv",
});

/** HH:mm, Kyiv. */
export const formatTime = (date: Date): string => TIME.format(date);

/** A history line's moment: the day and the time, Kyiv. */
export const formatDateTime = (date: Date): string => DATE_TIME.format(date);
