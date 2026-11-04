"use client";

import "../../../zod-client-config";
import { uk } from "@opika/i18n";
import { useId } from "react";
import { PasswordField } from "./PasswordField";
import { lengthHint, lengthProgress } from "./password-copy";

/**
 * The new password and its repeat, shared by the reset page and «Змінити
 * пароль» (and PW-2's «Створіть пароль»). The hint under the first states the
 * minimum, and a live line counts what is missing (§9 answer 2); the policy's other refusals come back from
 * the server on submit and arrive here as `refusal`, on the first field.
 * Whether the two match is checked here, before anything is sent.
 */
export function NewPasswordFields({
  label,
  password,
  repeat,
  onPassword,
  onRepeat,
  refusal,
  mismatch,
}: {
  /** The first field's label: «Пароль» on the reset page, «Новий пароль» in «Змінити пароль». */
  label: string;
  password: string;
  repeat: string;
  onPassword: (value: string) => void;
  onRepeat: (value: string) => void;
  /** The server's refusal, as a sentence; null when there is none. */
  refusal: string | null;
  /** The two differ, found on submit. */
  mismatch: boolean;
}) {
  const id = useId();
  return (
    <>
      <PasswordField
        id={`${id}-new`}
        label={label}
        value={password}
        onChange={onPassword}
        autoComplete="new-password"
        hint={lengthHint()}
        status={lengthProgress(password)}
        error={refusal}
      />
      <PasswordField
        id={`${id}-repeat`}
        label={uk.kabinet.setPassword.repeatLabel}
        value={repeat}
        onChange={onRepeat}
        autoComplete="new-password"
        error={mismatch ? uk.kabinet.password.mismatch : null}
      />
    </>
  );
}
