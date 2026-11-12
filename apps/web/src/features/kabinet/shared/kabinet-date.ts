import { uk } from "@opika/i18n";
import type { DateFieldLabels } from "../../../ui/DateField";
import { type DateFieldValue, monthNamesOf } from "../../../ui/date-field";

/** Every kabinet date's part labels, and the months in the genitive («листопада») from `Intl`. */
export const DATE_FIELD_LABELS: DateFieldLabels = {
  day: uk.kabinet.dateField.day,
  month: uk.kabinet.dateField.month,
  year: uk.kabinet.dateField.year,
  months: monthNamesOf("uk"),
};

/** The two refusals only a typed date has, by the error name the forms give them. */
export type TypedDateError = "dateIncomplete" | "dateNoSuchDate";

export const typedDateMessage = (error: TypedDateError): string =>
  error === "dateIncomplete" ? uk.kabinet.dateField.incomplete : uk.kabinet.dateField.noSuchDate;

/**
 * An operator's required date (registration, site visit) as its form's error name: «required»
 * when empty, a typed date's own refusal, or `future` past today. Null when it holds a date.
 */
export function requiredDateError<Future extends string>(
  value: DateFieldValue,
  future: Future,
): "required" | TypedDateError | Future | null {
  if (value.kind === "empty") return "required";
  if (value.kind === "date") return null;
  switch (value.reason) {
    case "incomplete":
      return "dateIncomplete";
    case "no_such_date":
      return "dateNoSuchDate";
    // These dates set no `min`, so the only bound a typed one can cross is today.
    case "before_min":
    case "after_max":
      return future;
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled reason; unreachable at runtime */
    default: {
      const unreachable: never = value.reason;
      return unreachable;
    }
  }
}
