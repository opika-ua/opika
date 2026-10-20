"use client";

import { uk } from "@opika/i18n";
import Link from "next/link";
import { type FormEvent, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { buttonClass, linkClass, TextField } from "../controls/controls";
import { PasswordField } from "./password/PasswordField";
import {
  PASSWORD_ENDPOINTS,
  postJson,
  type SignInOutcome,
  signInOutcomeOf,
} from "./password/password-api";
import { throttledMessage } from "./password/password-copy";
import { FORGOT_PATH, SHELTER_HOME } from "./routes";

/**
 * K1 · sign-in (KABINET N1; mock `Opika Kabinet.dc.html`, frames «K1 Вхід»
 * and «K1 Посилання надіслано», 1440 and 360), with the password since PW-1
 * (Oleksii's scope item 3, verbatim: "Sign-in page: email + password as the
 * primary form; «Надіслати посилання для входу» (existing magic link) stays as
 * a secondary option; «Забули пароль?» link."). Two states: the form, then
 * «check your email» once a link is asked for. No sign-up.
 *
 * - **The password** gets one sentence for every failure (§5,
 *   `signIn.wrongCredentials`), whatever the cause, and the delay's sentence,
 *   the same for every address, when the server says to wait. A success loads
 *   the cabinet's home.
 * - **The link** gets the same answer for a known and an unknown address: the
 *   route answers success either way (`handleKabinetAuth`), so this card
 *   can't tell them apart and never tries to.
 * - Resend is locked for 60s, the countdown in the label. The disabled button
 *   stays focusable (`aria-disabled`, never `disabled`) and the reason is
 *   written next to it, not in a tooltip (KABINET "Buttons").
 * - «check your email» ends with a person to write to (IN-E7, IN-T9): the
 *   card can't say a send failed or was blocked without telling a stranger
 *   which addresses exist, so the fallback is a human, not an error. The
 *   address is config (`EMAIL_REPLY_TO`, the same inbox every email's
 *   Reply-To names), passed in by the page, never typed into the copy.
 *
 * The form is built on the shared controls, theme tokens only ("Test logic,
 * not looks"); the «sent» state keeps the classes it shipped with.
 */

export const RESEND_LOCKOUT_SECONDS = 60;
export const SIGN_IN_PATH = "/api/auth/sign-in/magic-link";
/** Where the link lands after verification, and where a password sign-in goes: the cabinet's home. */
export const SIGN_IN_CALLBACK = SHELTER_HOME;

const FOCUS =
  "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px]";
const SECONDARY_DISABLED = `inline-flex min-h-14 flex-1 items-center justify-center rounded-rg-button bg-rg-fill px-6 text-[15px] whitespace-nowrap text-rg-ink-3 tablet:flex-none ${FOCUS}`;
const SECONDARY = `inline-flex min-h-14 flex-1 items-center justify-center rounded-rg-button bg-rg-fill px-6 text-[15px] whitespace-nowrap text-rg-ink tablet:flex-none ${FOCUS}`;
const TEXT_BUTTON = `inline-flex min-h-14 items-center justify-center px-2 text-[15px] whitespace-nowrap text-rg-ink underline ${FOCUS}`;
const TITLE =
  "text-2xl leading-7 font-bold tracking-[-0.02em] text-rg-ink tablet:text-[34px] tablet:leading-[38px] tablet:tracking-[-0.03em]";
const BODY = "text-[17px] leading-[26px] text-rg-ink-2";
const CAPTION = "text-[13px] leading-[18px] text-rg-ink-3";

const countdown = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

type State =
  /** `error`: the one sentence the form shows after a try, or null. */
  | { kind: "entering"; error: string | null }
  | { kind: "sent"; email: string; lockedFor: number; resendFailed: boolean };

export function SignInCard({
  send = defaultSend,
  signIn = defaultSignIn,
  onSignedIn = defaultSignedIn,
  contact,
}: {
  /** The magic link; injected so tests drive the real component without a network. */
  send?: (email: string) => Promise<boolean>;
  /** The password sign-in; injected so tests drive the real component without a network. */
  signIn?: (email: string, password: string) => Promise<SignInOutcome>;
  /** After a password sign-in: the cabinet's home. Injected so tests can see it called. */
  onSignedIn?: () => void;
  /**
   * Where to write if no email arrives (`kabinet.signInCard.notArrived`'s
   * `{contact}`). Null only where it isn't configured, which production
   * sign-in can't be (`emailProviderConfigOf` requires it); the line is then
   * left out rather than shown with a hole in it.
   */
  contact: string | null;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<State>({ kind: "entering", error: null });
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const emailId = useId();
  const passwordId = useId();
  const lockedFor = state.kind === "sent" ? state.lockedFor : 0;
  /** Where focus goes after a state change the user didn't navigate to, set only by such changes. */
  const pendingFocus = useRef<"title" | "email" | null>(null);

  // The heading changes under the user on «sent»: focus it, so a screen
  // reader announces the new state instead of a stale button. Back on the
  // form, focus the address. In the commit, so the element exists and each
  // request is taken by the render it was made for. «sent» arrives after the
  // network, so a passive effect would run a task later, after paint; a tap
  // on «a different address» handled in between would have its request taken
  // by that late effect, which finds no field yet, and both moves are lost.
  useLayoutEffect(() => {
    if (pendingFocus.current === "title") titleRef.current?.focus();
    if (pendingFocus.current === "email") emailRef.current?.focus();
    pendingFocus.current = null;
  }, [state.kind]);

  // One tick a second while the resend lockout runs; nothing while it doesn't.
  const locked = lockedFor > 0;
  useEffect(() => {
    if (!locked) return;
    const timer = setInterval(
      () =>
        setState((s) =>
          s.kind === "sent" && s.lockedFor > 0 ? { ...s, lockedFor: s.lockedFor - 1 } : s,
        ),
      1000,
    );
    return () => clearInterval(timer);
  }, [locked]);

  async function request(address: string): Promise<boolean> {
    setBusy(true);
    try {
      return await send(address);
    } finally {
      setBusy(false);
    }
  }

  /** The primary form: the password. */
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    let outcome: SignInOutcome;
    try {
      outcome = await signIn(email.trim(), password);
    } finally {
      setBusy(false);
    }
    switch (outcome.kind) {
      case "signed_in":
        onSignedIn();
        return;
      case "wrong":
        setState({ kind: "entering", error: uk.kabinet.signIn.wrongCredentials });
        return;
      case "throttled":
        setState({ kind: "entering", error: throttledMessage(outcome.minutes) });
        return;
      case "failed":
        setState({ kind: "entering", error: uk.kabinet.animalList.errors.actionFailed });
        return;
      /* v8 ignore next 4 -- exists so the compiler rejects an unhandled outcome; unreachable at runtime */
      default: {
        const unreachable: never = outcome;
        return unreachable;
      }
    }
  }

  /** The secondary way in: the magic link, to the address in the field. */
  async function onSendLink() {
    if (busy) return;
    // The address is all a link needs: the browser says what is wrong with
    // it, as it would for the form's own submit.
    if (emailRef.current !== null && !emailRef.current.reportValidity()) return;
    const address = email.trim();
    if (await request(address)) {
      pendingFocus.current = "title";
      setState({
        kind: "sent",
        email: address,
        lockedFor: RESEND_LOCKOUT_SECONDS,
        resendFailed: false,
      });
    } else {
      setState({ kind: "entering", error: uk.kabinet.signIn.sendFailed });
    }
  }

  async function onResend() {
    if (state.kind !== "sent" || state.lockedFor > 0 || busy) return;
    // A failed resend says so here, on this state: tapping «send again» and
    // seeing nothing change would read as sent (review of #93, finding 4).
    if (await request(state.email)) {
      setState({ ...state, lockedFor: RESEND_LOCKOUT_SECONDS, resendFailed: false });
    } else {
      setState({ ...state, resendFailed: true });
    }
  }

  function onOtherAddress() {
    pendingFocus.current = "email";
    setState({ kind: "entering", error: null });
  }

  return (
    <section
      aria-labelledby={`${emailId}-title`}
      className="flex w-full flex-col gap-4 rounded-rg-card bg-rg-surface p-5 tablet:max-w-lg tablet:p-8"
    >
      {state.kind === "entering" ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1
              id={`${emailId}-title`}
              ref={titleRef}
              tabIndex={-1}
              className="text-2xl font-bold text-rg-ink tablet:text-3xl"
            >
              {uk.kabinet.signIn.title}
            </h1>
            <p className="text-lg text-rg-ink-2">{uk.kabinet.signIn.intro}</p>
          </div>
          <form onSubmit={onSubmit} className="flex flex-col gap-6">
            <TextField
              id={emailId}
              ref={emailRef}
              label={uk.kabinet.signIn.emailLabel}
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <PasswordField
              id={passwordId}
              label={uk.kabinet.signIn.passwordLabel}
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
            />
            {state.error !== null ? (
              <p role="alert" className="text-base font-medium text-rg-ink">
                {state.error}
              </p>
            ) : null}
            <button
              type="submit"
              aria-disabled={busy || undefined}
              className={buttonClass("primary")}
            >
              {uk.kabinet.signIn.submitPassword}
            </button>
            <Link href={FORGOT_PATH} className={linkClass("text")}>
              {uk.kabinet.signIn.forgot}
            </Link>
          </form>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={onSendLink}
              aria-disabled={busy || undefined}
              className={buttonClass("secondary")}
            >
              {uk.kabinet.signIn.useLink}
            </button>
            <p className="text-sm text-rg-ink-3">{uk.kabinet.signIn.addressNote}</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <h1 id={`${emailId}-title`} ref={titleRef} tabIndex={-1} className={TITLE}>
            {uk.kabinet.signIn.sentTitle}
          </h1>
          <p className={BODY}>
            {uk.kabinet.signIn.sentBody.split("{email}").map((part, index) =>
              index === 0 ? (
                part
              ) : (
                <span key="email">
                  <strong className="font-medium">{state.email}</strong>
                  {part}
                </span>
              ),
            )}
          </p>
          <div className="h-2" />
          <p className={CAPTION}>{uk.kabinet.signIn.spamNote}</p>
          {contact !== null ? (
            <p className={CAPTION}>
              {uk.kabinet.signInCard.notArrived.replaceAll("{contact}", () => contact)}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onResend}
              aria-disabled={state.lockedFor > 0 || busy || undefined}
              className={state.lockedFor > 0 ? SECONDARY_DISABLED : SECONDARY}
            >
              {state.lockedFor > 0
                ? uk.kabinet.signIn.resendIn.replace("{time}", countdown(state.lockedFor))
                : uk.kabinet.signIn.resend}
            </button>
            <button type="button" onClick={onOtherAddress} className={TEXT_BUTTON}>
              {uk.kabinet.signIn.otherAddress}
            </button>
          </div>
          {state.resendFailed ? (
            <p role="alert" className="text-[15px] leading-[22px] font-medium text-rg-ink">
              {uk.kabinet.signIn.sendFailed}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

/** The magic link: the kabinet's own auth route, which answers 200 for any address. */
async function defaultSend(email: string): Promise<boolean> {
  try {
    const response = await fetch(SIGN_IN_PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, callbackURL: SIGN_IN_CALLBACK }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** The password sign-in through the kabinet's auth route (`/api/auth/sign-in/email`). */
async function defaultSignIn(email: string, password: string): Promise<SignInOutcome> {
  return signInOutcomeOf(await postJson(PASSWORD_ENDPOINTS.signIn, { email, password }));
}

/** A full load of the cabinet's home, carrying the session cookie the answer set. */
function defaultSignedIn() {
  window.location.assign(SIGN_IN_CALLBACK);
}
