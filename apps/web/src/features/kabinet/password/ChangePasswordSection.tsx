"use client";

import { uk } from "@opika/i18n";
import Link from "next/link";
import { type FormEvent, useId, useState } from "react";
import { buttonClass, linkClass } from "../../controls/controls";
import { FORGOT_PATH } from "../routes";
import { CARD_MESSAGE } from "./CardFrame";
import { NewPasswordFields } from "./NewPasswordFields";
import { PasswordField } from "./PasswordField";
import { type ChangeOutcome, changeOutcomeOf, PASSWORD_ENDPOINTS, postJson } from "./password-api";
import { refusalMessage } from "./password-copy";

/** Whether the signed-in shelter admin has a password yet (the page reads it server-side). */
export type PasswordState = { kind: "set" } | { kind: "not_set" };

type Feedback =
  | { kind: "none" }
  | { kind: "done" }
  | { kind: "refused"; message: string }
  | { kind: "mismatch" }
  | { kind: "wrong_current" }
  | { kind: "message"; message: string };

/**
 * «Змінити пароль» on `/kabinet` (Oleksii's scope item 7, verbatim:
 * "«Змінити пароль» (requires the current one; revokes other sessions)").
 * Shown to a shelter's own admin only, never in a support view. An admin who
 * has never set a password (they sign in by link) sees his note instead, with
 * «Забули пароль?» as the link to the page it names (scope item 9).
 *
 * On success the other sessions have ended and this browser holds a fresh one
 * (the server revokes them whatever the request says), so the fields clear
 * and the card says so.
 */
export function ChangePasswordSection({
  password,
  change = defaultChange,
}: {
  password: PasswordState;
  /** Injected so tests drive the real component without a network. */
  change?: (current: string, next: string) => Promise<ChangeOutcome>;
}) {
  const id = useId();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>({ kind: "none" });
  const [hasPassword, setHasPassword] = useState(password.kind === "set");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (next !== repeat) {
      setFeedback({ kind: "mismatch" });
      return;
    }
    setBusy(true);
    let outcome: ChangeOutcome;
    try {
      outcome = await change(current, next);
    } finally {
      setBusy(false);
    }
    switch (outcome.kind) {
      case "done":
        setCurrent("");
        setNext("");
        setRepeat("");
        setFeedback({ kind: "done" });
        return;
      case "refused":
        setFeedback({ kind: "refused", message: refusalMessage(outcome.refusal) });
        return;
      case "wrong_current":
        setFeedback({ kind: "wrong_current" });
        return;
      case "no_password":
        setHasPassword(false);
        return;
      case "throttled":
        setFeedback({ kind: "message", message: uk.kabinet.animalList.errors.rateLimited });
        return;
      case "failed":
        setFeedback({ kind: "message", message: uk.kabinet.animalList.errors.actionFailed });
        return;
      /* v8 ignore next 4 -- exists so the compiler rejects an unhandled outcome; unreachable at runtime */
      default: {
        const unreachable: never = outcome;
        return unreachable;
      }
    }
  }

  const [noteBefore, noteAfter] = uk.kabinet.changePassword.noPasswordYet.split(
    uk.kabinet.signIn.forgot,
  );

  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-4">
      <h2 id={`${id}-title`} className="text-xl font-bold text-rg-ink">
        {uk.kabinet.changePassword.title}
      </h2>
      {hasPassword ? (
        <form onSubmit={onSubmit} className="flex flex-col gap-6">
          <PasswordField
            id={`${id}-current`}
            label={uk.kabinet.changePassword.currentLabel}
            value={current}
            onChange={setCurrent}
            autoComplete="current-password"
            error={
              feedback.kind === "wrong_current" ? uk.kabinet.changePassword.wrongCurrent : null
            }
          />
          <NewPasswordFields
            label={uk.kabinet.changePassword.newLabel}
            password={next}
            repeat={repeat}
            onPassword={setNext}
            onRepeat={setRepeat}
            refusal={feedback.kind === "refused" ? feedback.message : null}
            mismatch={feedback.kind === "mismatch"}
          />
          <button
            type="submit"
            aria-disabled={busy || undefined}
            className={buttonClass("primary")}
          >
            {uk.kabinet.changePassword.submit}
          </button>
          <p role="status" className={CARD_MESSAGE}>
            {feedback.kind === "done"
              ? uk.kabinet.changePassword.done
              : feedback.kind === "message"
                ? feedback.message
                : null}
          </p>
        </form>
      ) : (
        <p className="text-lg text-rg-ink-2">
          {noteBefore}
          <Link href={FORGOT_PATH} className={linkClass("text")}>
            {uk.kabinet.signIn.forgot}
          </Link>
          {noteAfter}
        </p>
      )}
    </section>
  );
}

async function defaultChange(currentPassword: string, newPassword: string): Promise<ChangeOutcome> {
  return changeOutcomeOf(
    await postJson(PASSWORD_ENDPOINTS.change, {
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    }),
  );
}
