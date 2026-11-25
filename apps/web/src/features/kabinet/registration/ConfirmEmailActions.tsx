"use client";

import type { LoginEmailChangeResult } from "@opika/contracts";
import { fillTemplate, uk } from "@opika/i18n";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useRef, useState } from "react";
import { OPERATOR_CONTACT } from "../../../brand";
import type { ResendResult } from "../../../kabinet/registration/resend-confirmation";
import { Button } from "../../../ui/Button";
import { InlineStatus } from "../../../ui/feedback";
import { TextField } from "../../../ui/form";
import { Heading } from "../../../ui/Heading";
import { PasswordField } from "../../../ui/PasswordField";
import { ResendConfirmationButton } from "./ResendConfirmationButton";

const t = uk.kabinet.application.changeEmail;

export type ChangeLoginEmail = (input: {
  email: string;
  password: string;
}) => Promise<LoginEmailChangeResult>;

type FieldErrors = { email: string | null; password: string | null };
type Answer = { tone: "success" | "warning" | "error"; text: string } | null;

const NO_FIELD_ERRORS: FieldErrors = { email: null, password: null };

const FIELD_ERROR_TEXT = {
  required: uk.registration.errors.required,
  email: uk.kabinet.profileEdit.errors.emailFormat,
  same_email: t.sameEmail,
} as const;

/** What the form says for an answer: a field's own line, or one line under the form. */
function feedbackOf(result: LoginEmailChangeResult): { fields: FieldErrors; answer: Answer } {
  const line = (tone: "error" | "warning" | "success", text: string) => ({
    fields: NO_FIELD_ERRORS,
    answer: { tone, text },
  });
  switch (result.kind) {
    case "changed":
      return result.confirmation === "sent"
        ? line("success", fillTemplate(t.done, { email: result.email }))
        : line("warning", t.sentFailed);
    case "invalid":
      return {
        fields: {
          email: result.fields.email === undefined ? null : FIELD_ERROR_TEXT[result.fields.email],
          password:
            result.fields.password === undefined ? null : FIELD_ERROR_TEXT[result.fields.password],
        },
        answer: null,
      };
    case "wrong_password":
      return {
        fields: { email: null, password: uk.kabinet.changePassword.wrongCurrent },
        answer: null,
      };
    // Registration's own answer for a taken address (§6).
    case "email_taken":
      return { fields: { email: uk.registration.errors.emailTaken, password: null }, answer: null };
    case "rate_limited":
      return line("error", uk.registration.errors.rateLimited);
    case "limiter_unavailable":
      return line("error", t.unavailable);
    case "daily_cap":
      return line(
        "error",
        fillTemplate(uk.registration.errors.dailyCap, { email: OPERATOR_CONTACT.email }),
      );
    case "not_needed":
      return { fields: NO_FIELD_ERRORS, answer: null };
    case "failed":
      return line("error", t.failed);
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled kind; unreachable at runtime */
    default: {
      const unreachable: never = result;
      return unreachable;
    }
  }
}

/**
 * The «Підтвердіть email» banner's two actions: «Надіслати ще раз», and «Змінити пошту», which
 * opens the form for a new login address behind the current password (owner, 2026-11-25).
 */
export function ConfirmEmailActions({
  resend,
  change,
}: {
  resend: () => Promise<ResendResult>;
  change: ChangeLoginEmail;
}) {
  const id = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<FieldErrors>(NO_FIELD_ERRORS);
  const [answer, setAnswer] = useState<Answer>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const close = () => {
    setOpen(false);
    setFields(NO_FIELD_ERRORS);
    setPassword("");
    toggleRef.current?.focus();
  };

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    let result: LoginEmailChangeResult;
    try {
      result = await change({ email, password }).catch(
        (): LoginEmailChangeResult => ({ kind: "failed" }),
      );
    } finally {
      setBusy(false);
    }
    const next = feedbackOf(result);
    setFields(next.fields);
    setAnswer(next.answer);
    if (result.kind === "changed" || result.kind === "not_needed") {
      setOpen(false);
      setEmail("");
      setPassword("");
      // The banner names the new address (or goes, if nothing is left to confirm).
      router.refresh();
      return;
    }
    if (next.fields.email !== null) emailRef.current?.focus();
    else if (next.fields.password !== null) passwordRef.current?.focus();
  }

  return (
    <div className="flex w-full flex-col items-start gap-3">
      <div className="flex flex-wrap items-start gap-3">
        <ResendConfirmationButton action={resend} />
        <Button
          ref={toggleRef}
          variant="ghost"
          aria-expanded={open}
          aria-controls={open ? `${id}-form` : undefined}
          onClick={() => {
            if (open) close();
            else {
              setAnswer(null);
              setOpen(true);
            }
          }}
        >
          {t.action}
        </Button>
      </div>
      {open ? (
        <form
          id={`${id}-form`}
          aria-labelledby={`${id}-title`}
          onSubmit={onSubmit}
          noValidate
          className="flex w-full max-w-form flex-col gap-4"
        >
          <Heading level={3} id={`${id}-title`}>
            {t.title}
          </Heading>
          <TextField
            id={`${id}-email`}
            ref={emailRef}
            type="email"
            label={t.emailLabel}
            hint={t.hint}
            error={fields.email}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
          <PasswordField
            id={`${id}-password`}
            ref={passwordRef}
            label={uk.kabinet.changePassword.currentLabel}
            error={fields.password}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
            showLabel={uk.kabinet.signIn.showPassword}
            hideLabel={uk.kabinet.signIn.hidePassword}
          />
          {answer === null || answer.tone === "success" ? null : (
            <InlineStatus tone={answer.tone}>{answer.text}</InlineStatus>
          )}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" status={busy ? "loading" : "idle"}>
              {t.submit}
            </Button>
            <Button variant="ghost" onClick={close}>
              {uk.kabinet.profileEdit.saveBar.cancel}
            </Button>
          </div>
        </form>
      ) : null}
      {!open && answer !== null ? (
        <InlineStatus tone={answer.tone}>{answer.text}</InlineStatus>
      ) : null}
    </div>
  );
}
