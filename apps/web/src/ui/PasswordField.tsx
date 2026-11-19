"use client";

import { type InputHTMLAttributes, type ReactNode, type Ref, useState } from "react";
import { cx } from "./cx";
import {
  CONTROL,
  FieldError,
  FieldHint,
  type FieldSlots,
  fieldA11y,
  HINT,
  INVALID,
  LABEL,
} from "./form";
import { Icon } from "./Icon";

export type PasswordFieldProps = FieldSlots &
  Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type" | "autoComplete"> & {
    autoComplete: "current-password" | "new-password";
    /** The eye's accessible names: what pressing it does next. */
    showLabel: string;
    hideLabel: string;
    /** A live line under the hint (how many characters are missing), announced politely. */
    status?: ReactNode | undefined;
    /** A link at the end of the label's row (sign-in's «Забули пароль?»). */
    labelAside?: ReactNode;
    ref?: Ref<HTMLInputElement>;
  };

/**
 * A password input with an eye toggle inside it, on the field frame `TextField` uses. Showing keeps
 * the value; a tap keeps focus (and the phone keyboard) in the input. The kit holds no copy.
 */
export function PasswordField({
  id,
  label,
  hint,
  error,
  describedBy,
  showLabel,
  hideLabel,
  status,
  labelAside,
  className,
  ref,
  ...props
}: PasswordFieldProps) {
  const [shown, setShown] = useState(false);
  const slots = { id, label, hint, error, describedBy };
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {labelAside === undefined ? (
        <label htmlFor={id} className={LABEL}>
          {label}
        </label>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-x-3">
          <label htmlFor={id} className={LABEL}>
            {label}
          </label>
          {labelAside}
        </div>
      )}
      <div className="relative min-w-0">
        <input
          id={id}
          ref={ref}
          type={shown ? "text" : "password"}
          autoCapitalize="none"
          spellCheck={false}
          className={cx(CONTROL, "pr-14", error ? INVALID : "", className)}
          {...fieldA11y(slots)}
          {...props}
        />
        <button
          type="button"
          aria-label={shown ? hideLabel : showLabel}
          aria-controls={id}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => setShown((now) => !now)}
          className="absolute top-0 right-0 inline-flex size-target cursor-pointer items-center justify-center rounded-field text-ink focus-ring"
        >
          <Icon name={shown ? "eye-off" : "eye"} size="md" />
        </button>
      </div>
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
      {hint !== undefined ? <FieldHint id={`${id}-hint`}>{hint}</FieldHint> : null}
      {status !== undefined ? (
        <p aria-live="polite" className={HINT}>
          {status}
        </p>
      ) : null}
    </div>
  );
}
