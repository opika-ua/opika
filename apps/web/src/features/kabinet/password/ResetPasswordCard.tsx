"use client";

import { uk } from "@opika/i18n";
import Link from "next/link";
import { type FormEvent, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { buttonClass, linkClass } from "../../controls/controls";
import { FORGOT_PATH, SIGN_IN_PAGE_PATH } from "../routes";
import { CARD_MESSAGE, CARD_TITLE, CardFrame } from "./CardFrame";
import { NewPasswordFields } from "./NewPasswordFields";
import { PASSWORD_ENDPOINTS, postJson, type ResetOutcome, resetOutcomeOf } from "./password-api";
import { refusalMessage } from "./password-copy";

/**
 * The new password from a reset link (`/kabinet/vkhid/novyi-parol?token=…`,
 * §4.1). The page's GET only shows this form; the token is used up only by
 * its POST, through Better Auth's `/reset-password`, so a mail scanner opening
 * the link consumes nothing. On success every session of that person has
 * ended (scope item 6), so the card says so and points to the sign-in page.
 */
/** The hidden field the reset token travels in, once it has left the address bar. */
const TOKEN_FIELD = "token";

type State =
  | { kind: "entering"; refusal: string | null; mismatch: boolean; message: string | null }
  | { kind: "done" }
  | { kind: "invalid_link" };

export function ResetPasswordCard({
  token,
  reset = defaultReset,
}: {
  /** From the link; empty when the link carried none (then the POST is refused as invalid). */
  token: string;
  /** Injected so tests drive the real component without a network. */
  reset?: (token: string, password: string) => Promise<ResetOutcome>;
}) {
  const id = useId();
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<State>({
    kind: "entering",
    refusal: null,
    mismatch: false,
    message: null,
  });
  const titleRef = useRef<HTMLHeadingElement>(null);

  // The card's content changes under the person on done or an invalid link:
  // focus the heading so a screen reader announces the new state.
  useLayoutEffect(() => {
    if (state.kind !== "entering") titleRef.current?.focus();
  }, [state.kind]);

  // Oleksii, 2026-10-20, verbatim: "Address bar: after the page reads the token, remove it with
  // history.replaceState. The form carries it in a hidden field." The page has read it (the
  // `token` prop, now in the form's hidden field), so the address bar, the history entry and
  // anything that reads `location` later see the bare path.
  useEffect(() => {
    if (window.location.search !== "") {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (password !== repeat) {
      setState({ kind: "entering", refusal: null, mismatch: true, message: null });
      return;
    }
    const carried = new FormData(event.currentTarget).get(TOKEN_FIELD);
    setBusy(true);
    let outcome: ResetOutcome;
    try {
      outcome = await reset(typeof carried === "string" ? carried : "", password);
    } finally {
      setBusy(false);
    }
    switch (outcome.kind) {
      case "done":
      case "invalid_link":
        setState({ kind: outcome.kind });
        return;
      case "refused":
        setState({
          kind: "entering",
          refusal: refusalMessage(outcome.refusal),
          mismatch: false,
          message: null,
        });
        return;
      case "throttled":
        setState({
          kind: "entering",
          refusal: null,
          mismatch: false,
          message: uk.kabinet.forgot.throttled,
        });
        return;
      case "no_answer":
        setState({
          kind: "entering",
          refusal: null,
          mismatch: false,
          message: uk.kabinet.signIn.failed,
        });
        return;
      case "failed":
        setState({
          kind: "entering",
          refusal: null,
          mismatch: false,
          message: uk.kabinet.animalList.errors.actionFailed,
        });
        return;
      /* v8 ignore next 4 -- exists so the compiler rejects an unhandled outcome; unreachable at runtime */
      default: {
        const unreachable: never = outcome;
        return unreachable;
      }
    }
  }

  const title = (
    <h1 id={`${id}-title`} ref={titleRef} tabIndex={-1} className={CARD_TITLE}>
      {uk.kabinet.reset.title}
    </h1>
  );

  if (state.kind === "done") {
    return (
      <CardFrame titleId={`${id}-title`}>
        {title}
        <p className={CARD_MESSAGE}>{uk.kabinet.reset.done}</p>
        <Link href={SIGN_IN_PAGE_PATH} className={linkClass("text")}>
          {uk.kabinet.inviteLanding.signIn}
        </Link>
      </CardFrame>
    );
  }

  if (state.kind === "invalid_link") {
    const [before, after] = uk.kabinet.reset.invalidLink.split("{link}");
    return (
      <CardFrame titleId={`${id}-title`}>
        {title}
        <p className={CARD_MESSAGE}>
          {before}
          <Link href={FORGOT_PATH} className={linkClass("text")}>
            {uk.kabinet.reset.invalidLinkText}
          </Link>
          {after}
        </p>
      </CardFrame>
    );
  }

  return (
    <CardFrame titleId={`${id}-title`}>
      {title}
      <form onSubmit={onSubmit} className="flex flex-col gap-6">
        <input type="hidden" name={TOKEN_FIELD} value={token} />
        <NewPasswordFields
          label={uk.kabinet.setPassword.newLabel}
          password={password}
          repeat={repeat}
          onPassword={setPassword}
          onRepeat={setRepeat}
          refusal={state.refusal}
          mismatch={state.mismatch}
        />
        <button type="submit" aria-disabled={busy || undefined} className={buttonClass("primary")}>
          {uk.kabinet.reset.submit}
        </button>
      </form>
      <p role="alert" className={CARD_MESSAGE}>
        {state.message}
      </p>
    </CardFrame>
  );
}

async function defaultReset(token: string, newPassword: string): Promise<ResetOutcome> {
  return resetOutcomeOf(await postJson(PASSWORD_ENDPOINTS.reset, { token, newPassword }));
}
