import type { CalendarDate } from "@opika/domain";
import type { ReactNode } from "react";
import { cx } from "./cx";
import {
  DAY_DIGITS,
  type DateFieldValue,
  type DateParts,
  datePartsOf,
  dateValueOfParts,
  YEAR_DIGITS,
} from "./date-field";
import { CONTROL, FieldError, FieldHint, INVALID, LABEL } from "./form";

export type DateFieldLabels = {
  readonly day: string;
  readonly month: string;
  readonly year: string;
  /** January first, as `monthNamesOf(locale)` gives them. */
  readonly months: readonly string[];
};

const PART_LABEL = "text-label text-ink-2";

const digitsOf = (typed: string, max: number): string => typed.replace(/\D/g, "").slice(0, max);

/**
 * A calendar date as day, month and year in one fieldset, never a native date input (its order
 * follows the browser's language, and it takes a five-digit year). Stateless: `value` carries what
 * is typed, so the caller can reset it; `onChange` gets the next value, checked against the bounds.
 */
export function DateField({
  id,
  legend,
  labels,
  value,
  today,
  min,
  hint,
  error,
  required,
  disabled,
  onChange,
  className,
}: {
  /** The day part's id, so a link to `#id` lands on the first part; the others are `id-month`, `id-year`. */
  id: string;
  legend: ReactNode;
  labels: DateFieldLabels;
  value: DateFieldValue;
  /** Today in Kyiv (`kyivCalendarDateOf(now)`): the latest date accepted. */
  today: CalendarDate;
  /** The earliest date accepted, when there is one. */
  min?: CalendarDate | undefined;
  hint?: ReactNode | undefined;
  /** One message for the whole date; non-null marks every part invalid. */
  error?: string | null | undefined;
  required?: boolean | undefined;
  disabled?: boolean | undefined;
  onChange: (value: DateFieldValue) => void;
  /** Layout only. */
  className?: string | undefined;
}) {
  const parts = datePartsOf(value);
  const change = (patch: Partial<DateParts>) =>
    onChange(dateValueOfParts({ ...parts, ...patch }, { today, min }));
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const described = [...(hint !== undefined ? [hintId] : []), ...(error ? [errorId] : [])];
  const part = {
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? errorId : undefined,
    required,
    className: cx(CONTROL, error ? INVALID : ""),
  } as const;
  return (
    <fieldset
      disabled={disabled}
      aria-describedby={described.length > 0 ? described.join(" ") : undefined}
      className={cx("flex min-w-0 flex-col gap-2", className)}
    >
      <legend className={cx(LABEL, "mb-2")}>{legend}</legend>
      {/* Day, month, year: the order the date is said in. The year wraps below on a narrow phone. */}
      <div className="flex flex-wrap gap-3">
        <div className="flex w-16 flex-col gap-1">
          <label htmlFor={id} className={PART_LABEL}>
            {labels.day}
          </label>
          <input
            id={id}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={DAY_DIGITS}
            value={parts.day}
            onChange={(event) => change({ day: digitsOf(event.currentTarget.value, DAY_DIGITS) })}
            {...part}
          />
        </div>
        <div className="flex min-w-36 flex-1 flex-col gap-1 tablet:w-48 tablet:flex-none">
          <label htmlFor={`${id}-month`} className={PART_LABEL}>
            {labels.month}
          </label>
          <select
            id={`${id}-month`}
            value={parts.month}
            onChange={(event) => change({ month: event.currentTarget.value })}
            {...part}
          >
            <option value="" />
            {labels.months.map((name, index) => (
              <option key={name} value={String(index + 1)}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex w-24 flex-col gap-1">
          <label htmlFor={`${id}-year`} className={PART_LABEL}>
            {labels.year}
          </label>
          <input
            id={`${id}-year`}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={YEAR_DIGITS}
            value={parts.year}
            onChange={(event) => change({ year: digitsOf(event.currentTarget.value, YEAR_DIGITS) })}
            {...part}
          />
        </div>
      </div>
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
      {hint !== undefined ? <FieldHint id={hintId}>{hint}</FieldHint> : null}
    </fieldset>
  );
}
