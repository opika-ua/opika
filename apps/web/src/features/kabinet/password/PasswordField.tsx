"use client";

import { uk } from "@opika/i18n";
import { type Ref, useState } from "react";
import { buttonClass, CONTROL, ERROR, HINT, INVALID, LABEL } from "../../controls/controls";

/**
 * A password field with its show/hide button (Oleksii's scope item 2:
 * "password + repeat, show/hide"), on the shared controls' tokens only, so a
 * rebrand restyles it with the rest. The button's name says what pressing it
 * does («Показати пароль» / «Сховати пароль»), so a screen reader hears the
 * state from the name; the field keeps its value and focus either way.
 *
 * `hint` (the live length, §9 answer 2) and `error` are linked to the field
 * with `aria-describedby`, as the shared `TextField` links its own.
 */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  hint,
  error,
  inputRef,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  hint?: string;
  error?: string | null;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const [shown, setShown] = useState(false);
  const describedBy = [
    ...(hint !== undefined ? [`${id}-hint`] : []),
    ...(error ? [`${id}-error`] : []),
  ];
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <div className="flex min-w-0 gap-2">
        <input
          id={id}
          ref={inputRef}
          type={shown ? "text" : "password"}
          autoComplete={autoComplete}
          autoCapitalize="none"
          spellCheck={false}
          required
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy.length > 0 ? describedBy.join(" ") : undefined}
          className={`${CONTROL} ${error ? INVALID : ""}`}
        />
        <button
          type="button"
          aria-controls={id}
          onClick={() => setShown((now) => !now)}
          className={`${buttonClass("secondary")} flex-none`}
        >
          {shown ? uk.kabinet.signIn.hidePassword : uk.kabinet.signIn.showPassword}
        </button>
      </div>
      {error ? (
        <p id={`${id}-error`} className={ERROR}>
          {error}
        </p>
      ) : null}
      {hint !== undefined ? (
        <p id={`${id}-hint`} className={HINT}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
