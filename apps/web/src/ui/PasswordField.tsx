"use client";

import { type InputHTMLAttributes, type Ref, useState } from "react";
import { Button } from "./Button";
import { cx } from "./cx";
import { CONTROL, FieldError, FieldHint, type FieldSlots, fieldA11y, INVALID, LABEL } from "./form";

export type PasswordFieldProps = FieldSlots &
  Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type" | "autoComplete"> & {
    autoComplete: "current-password" | "new-password";
    /** The toggle's names say what pressing it does, so a screen reader hears the state from them. */
    showLabel: string;
    hideLabel: string;
    ref?: Ref<HTMLInputElement>;
  };

/**
 * A password input with its show/hide button, on the field frame `TextField` uses: label, hint and
 * error linked with `aria-describedby`. Showing keeps the value and the focus where they are. The
 * button is beside the field from `tablet`, under it on a phone. The kit holds no copy.
 */
export function PasswordField({
  id,
  label,
  hint,
  error,
  describedBy,
  showLabel,
  hideLabel,
  className,
  ref,
  ...props
}: PasswordFieldProps) {
  const [shown, setShown] = useState(false);
  const slots = { id, label, hint, error, describedBy };
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <div className="flex min-w-0 flex-col gap-2 tablet:flex-row">
        <input
          id={id}
          ref={ref}
          type={shown ? "text" : "password"}
          autoCapitalize="none"
          spellCheck={false}
          className={cx(CONTROL, error ? INVALID : "", className)}
          {...fieldA11y(slots)}
          {...props}
        />
        <Button
          variant="secondary"
          aria-controls={id}
          onClick={() => setShown((now) => !now)}
          className="w-full tablet:w-auto"
        >
          {shown ? hideLabel : showLabel}
        </Button>
      </div>
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
      {hint !== undefined ? <FieldHint id={`${id}-hint`}>{hint}</FieldHint> : null}
    </div>
  );
}
