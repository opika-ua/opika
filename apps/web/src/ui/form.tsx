import type {
  InputHTMLAttributes,
  ReactNode,
  Ref,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cx } from "./cx";

/**
 * Form controls, absorbed from `features/controls/controls.tsx`. Plain components with no hooks, so a
 * server page and a client form can both use them. Every control is 48px tall, 16px text (iOS does not
 * zoom on focus), labelled, and linked to its hint and error with `aria-describedby`. Invalid is an
 * inset ink ring plus the error's words, never a colour alone.
 */
export const CONTROL =
  "min-h-target w-full min-w-0 rounded-field border-2 border-line bg-surface px-4 text-body text-ink focus-ring";
export const INVALID = "ring-2 ring-inset ring-ink";
export const LABEL = "text-label text-ink";
export const HINT = "text-caption text-ink-2";
export const ERROR = "text-label text-ink";

export function FieldHint({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div id={id} className={cx("flex flex-col gap-1", HINT)}>
      {children}
    </div>
  );
}

export function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className={ERROR}>
      {children}
    </p>
  );
}

export type FieldSlots = {
  id: string;
  label: ReactNode;
  /** Shown under the control and linked with `aria-describedby`. */
  hint?: ReactNode | undefined;
  /** The field's message; non-null marks the control invalid and links it. */
  error?: string | null | undefined;
  /** Extra ids the control is described by (a counter, a shared note). */
  describedBy?: readonly string[] | undefined;
};

export function fieldA11y({ id, hint, error, describedBy = [] }: FieldSlots) {
  const ids = [
    ...(hint !== undefined ? [`${id}-hint`] : []),
    ...describedBy,
    ...(error ? [`${id}-error`] : []),
  ];
  return {
    "aria-invalid": error ? true : undefined,
    "aria-describedby": ids.length > 0 ? ids.join(" ") : undefined,
  } as const;
}

function FieldFrame({ slots, children }: { slots: FieldSlots; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={slots.id} className={LABEL}>
        {slots.label}
      </label>
      {children}
      {slots.error ? <FieldError id={`${slots.id}-error`}>{slots.error}</FieldError> : null}
      {slots.hint !== undefined ? (
        <FieldHint id={`${slots.id}-hint`}>{slots.hint}</FieldHint>
      ) : null}
    </div>
  );
}

export function TextField({
  id,
  label,
  hint,
  error,
  describedBy,
  className,
  ref,
  ...props
}: FieldSlots &
  Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & { ref?: Ref<HTMLInputElement> }) {
  const slots = { id, label, hint, error, describedBy };
  return (
    <FieldFrame slots={slots}>
      <input
        id={id}
        ref={ref}
        className={cx(CONTROL, error ? INVALID : "", className)}
        {...fieldA11y(slots)}
        {...props}
      />
    </FieldFrame>
  );
}

export function TextArea({
  id,
  label,
  hint,
  error,
  describedBy,
  className,
  ref,
  ...props
}: FieldSlots &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> & { ref?: Ref<HTMLTextAreaElement> }) {
  const slots = { id, label, hint, error, describedBy };
  return (
    <FieldFrame slots={slots}>
      <textarea
        id={id}
        ref={ref}
        className={cx(CONTROL, "min-h-30 resize-y py-3", error ? INVALID : "", className)}
        {...fieldA11y(slots)}
        {...props}
      />
    </FieldFrame>
  );
}

export function Select({
  id,
  label,
  hint,
  error,
  describedBy,
  className,
  children,
  ...props
}: FieldSlots & Omit<SelectHTMLAttributes<HTMLSelectElement>, "id">) {
  const slots = { id, label, hint, error, describedBy };
  return (
    <FieldFrame slots={slots}>
      <select
        id={id}
        className={cx(CONTROL, error ? INVALID : "", className)}
        {...fieldA11y(slots)}
        {...props}
      >
        {children}
      </select>
    </FieldFrame>
  );
}

const OPTION_ROW =
  "flex min-h-target items-center gap-3 rounded-field border-2 border-line bg-surface px-4";

/**
 * One option of a radio group. The whole row is the label and the 48px target; the radio holds focus.
 * The group's question is the surrounding `fieldset`'s `legend`.
 */
export function Radio({
  label,
  className,
  ...props
}: { label: ReactNode } & Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return (
    <label className={cx(OPTION_ROW, className)}>
      <input type="radio" className="focus-ring" {...props} />
      <span className={LABEL}>{label}</span>
    </label>
  );
}

/** `Radio`'s row for a choice of several. */
export function Checkbox({
  label,
  className,
  ...props
}: { label: ReactNode } & Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return (
    <label className={cx(OPTION_ROW, className)}>
      <input type="checkbox" className="focus-ring" {...props} />
      <span className={LABEL}>{label}</span>
    </label>
  );
}

export type Segment<T extends string> = {
  value: T;
  label: ReactNode;
  /** A line under the label inside the segment (a size's weight hint). */
  hint?: ReactNode;
};

/**
 * Shared look of a segmented track and its segments (the radio control below and the gallery's link
 * species toggle). The 4px inset all round is the 2px border plus 2px padding, so a 44px segment fills
 * the 52px track and its 8px radius follows the 12px outer curve.
 */
export const SEGMENT_TRACK = "flex min-h-13 gap-1 rounded-field border-2 bg-page p-0.5";
export const SEGMENT =
  "relative flex min-h-11 min-w-16 flex-1 items-center justify-center rounded-tag px-4 text-center text-label";
// A 48px hit area on a 44px segment: the pseudo-element reaches 2px into the track padding.
export const SEGMENT_HIT = "before:absolute before:inset-x-0 before:-inset-y-0.5";
export const SEGMENT_ON = "bg-ink text-on-ink";
export const SEGMENT_OFF = "text-ink-2 hover:bg-line";

/**
 * A segmented control built from native radio buttons: arrow keys move the choice and a screen reader
 * announces "1 of 3", with nothing re-implemented. Full width on a phone, shrink-to-fit from `tablet:`;
 * segments wrap onto more lines when they do not fit.
 * `value` null means nothing chosen yet, which shows no segment selected.
 */
export function SegmentedControl<T extends string>({
  name,
  legend,
  segments,
  value,
  onChange,
  disabled = false,
  hint,
  error,
  describedBy = [],
}: {
  name: string;
  legend: ReactNode;
  segments: readonly Segment<T>[];
  value: T | null;
  onChange: (value: T) => void;
  disabled?: boolean;
  hint?: ReactNode;
  error?: string | null;
  describedBy?: readonly string[];
}) {
  const ids = [
    ...(hint !== undefined ? [`${name}-hint`] : []),
    ...describedBy,
    ...(error ? [`${name}-error`] : []),
  ];
  return (
    <fieldset
      className="flex min-w-0 flex-col gap-2"
      disabled={disabled}
      aria-describedby={ids.length > 0 ? ids.join(" ") : undefined}
      aria-invalid={error ? true : undefined}
    >
      <legend className={cx(LABEL, "mb-2")}>{legend}</legend>
      <div
        className={cx(
          SEGMENT_TRACK,
          "w-full flex-wrap border-line tablet:w-fit",
          error ? INVALID : "",
        )}
      >
        {segments.map((segment) => (
          <label
            key={segment.value}
            className={cx(
              SEGMENT,
              SEGMENT_HIT,
              "cursor-pointer flex-col focus-ring-within has-disabled:cursor-default tablet:flex-none",
              value === segment.value ? SEGMENT_ON : SEGMENT_OFF,
            )}
          >
            <input
              type="radio"
              className="sr-only"
              name={name}
              value={segment.value}
              checked={value === segment.value}
              onChange={() => onChange(segment.value)}
            />
            <span>{segment.label}</span>
            {segment.hint !== undefined ? (
              <span className="text-caption">{segment.hint}</span>
            ) : null}
          </label>
        ))}
      </div>
      {error ? <FieldError id={`${name}-error`}>{error}</FieldError> : null}
      {hint !== undefined ? <FieldHint id={`${name}-hint`}>{hint}</FieldHint> : null}
    </fieldset>
  );
}
