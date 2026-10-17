import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  Ref,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

/**
 * The shared controls (K4 is the first consumer; inbox K4-T12). Styled only
 * through theme tokens: the `rg-*` colours and radii, Tailwind's type and
 * spacing scale, and `--spacing-target` for the 48px minimum height every
 * control carries (`globals.css`). Oleksii, 2026-10-17: "styled only through
 * shared design tokens (colour, type, spacing) so the rebrand is a token
 * swap. No one-off styles in components." A rebrand edits the tokens and this
 * file, never a screen.
 *
 * Plain components, no hooks: a server page and a client form can both use
 * them. Existing screens keep their own class strings until a change touches
 * them (not migrated in PR 2).
 */

/** The one visible keyboard-focus indicator, on `:focus-visible` only. */
export const FOCUS_RING =
  "focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-solid focus-visible:outline-rg-registry";

export type ButtonVariant = "primary" | "secondary" | "text" | "icon";

const BUTTON: Record<ButtonVariant, string> = {
  primary: "rounded-rg-button bg-rg-ink px-6 text-base font-medium text-rg-surface",
  secondary: "rounded-rg-button bg-rg-fill px-6 text-base font-medium text-rg-ink",
  text: "px-2 text-base text-rg-ink underline",
  /** A glyph-only control (a dialog's ✕); its name goes in `aria-label`. */
  icon: "w-target flex-none rounded-rg-button bg-rg-fill text-lg text-rg-ink",
};

export const buttonClass = (variant: ButtonVariant): string =>
  `inline-flex min-h-target items-center justify-center ${BUTTON[variant]} ${FOCUS_RING}`;

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  ref?: Ref<HTMLButtonElement>;
}) {
  return <button type={type} className={`${buttonClass(variant)} ${className}`} {...props} />;
}

const CONTROL = `min-h-target w-full min-w-0 rounded-rg-button bg-rg-fill px-4 text-lg text-rg-ink ${FOCUS_RING}`;
/** An invalid control: an inset ink ring, never a colour of its own. */
const INVALID = "ring-2 ring-inset ring-rg-ink";
const LABEL = "text-base font-medium text-rg-ink";
const HINT = "text-sm text-rg-ink-3";
const ERROR = "text-base font-medium text-rg-ink";

type FieldSlots = {
  id: string;
  label: ReactNode;
  /** Shown under the control and linked with `aria-describedby`. */
  hint?: ReactNode | undefined;
  /** The field's message; non-null marks the control invalid and links it. */
  error?: string | null | undefined;
  /** Extra ids the control is described by (a counter, a shared note). */
  describedBy?: readonly string[] | undefined;
};

function fieldA11y({ id, hint, error, describedBy = [] }: FieldSlots) {
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
      {slots.error ? (
        <p id={`${slots.id}-error`} className={ERROR}>
          {slots.error}
        </p>
      ) : null}
      {slots.hint !== undefined ? (
        <div id={`${slots.id}-hint`} className={`flex flex-col gap-1 ${HINT}`}>
          {slots.hint}
        </div>
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
  className = "",
  ...props
}: FieldSlots & Omit<InputHTMLAttributes<HTMLInputElement>, "id">) {
  const slots = { id, label, hint, error, describedBy };
  return (
    <FieldFrame slots={slots}>
      <input
        id={id}
        className={`${CONTROL} ${error ? INVALID : ""} ${className}`}
        {...fieldA11y(slots)}
        {...props}
      />
    </FieldFrame>
  );
}

export function TextAreaField({
  id,
  label,
  hint,
  error,
  describedBy,
  className = "",
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
        className={`${CONTROL} min-h-30 resize-y py-3 ${error ? INVALID : ""} ${className}`}
        {...fieldA11y(slots)}
        {...props}
      />
    </FieldFrame>
  );
}

export function SelectField({
  id,
  label,
  hint,
  error,
  describedBy,
  className = "",
  children,
  ...props
}: FieldSlots & Omit<SelectHTMLAttributes<HTMLSelectElement>, "id">) {
  const slots = { id, label, hint, error, describedBy };
  return (
    <FieldFrame slots={slots}>
      <select
        id={id}
        className={`${CONTROL} ${error ? INVALID : ""} ${className}`}
        {...fieldA11y(slots)}
        {...props}
      >
        {children}
      </select>
    </FieldFrame>
  );
}

export type Segment<T extends string> = {
  value: T;
  label: ReactNode;
  /** A line under the label inside the segment (a size's weight hint). */
  hint?: ReactNode;
};

/**
 * N7's segmented control, as a group of native radio buttons: arrow keys
 * move the choice and a screen reader announces "1 of 3", with nothing
 * re-implemented. The radio sits inside its segment, visually hidden; the
 * segment carries the 48px minimum height (`min-h-target`), the selected
 * state (white with an inset ink ring, N7) and the focus ring while its radio
 * has keyboard focus. Segments wrap onto more lines when they don't fit
 * (Oleksii, K3 sheet answer 8: "stack the segments on a narrow screen if
 * they don't fit"). `value` null means nothing chosen yet, which a draft's
 * unanswered size shows as no segment selected (F-B1).
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
      <legend className={`${LABEL} mb-2`}>{legend}</legend>
      <div
        className={`flex flex-wrap gap-1 rounded-rg-button bg-rg-fill p-1 ${error ? INVALID : ""}`}
      >
        {segments.map((segment) => (
          <label
            key={segment.value}
            className={`flex min-h-target min-w-0 flex-auto cursor-pointer flex-col items-center justify-center rounded-rg-button px-2 py-1 text-center text-base text-rg-ink has-checked:bg-rg-surface has-checked:font-medium has-checked:ring-2 has-checked:ring-rg-ink has-checked:ring-inset has-focus-visible:outline-3 has-focus-visible:outline-offset-3 has-focus-visible:outline-solid has-focus-visible:outline-rg-registry has-disabled:cursor-default tablet:px-4`}
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
            {segment.hint !== undefined ? <span className={HINT}>{segment.hint}</span> : null}
          </label>
        ))}
      </div>
      {error ? (
        <p id={`${name}-error`} className={ERROR}>
          {error}
        </p>
      ) : null}
      {hint !== undefined ? (
        <div id={`${name}-hint`} className={HINT}>
          {hint}
        </div>
      ) : null}
    </fieldset>
  );
}
