"use client";

import "../../zod-client-config";
import { uk } from "@opika/i18n";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { SIGN_IN_LINK_NOT_SENT_CODE } from "../../kabinet/password-codes";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { TextField } from "../../ui/form";
import { Heading } from "../../ui/Heading";
import { PasswordField } from "../../ui/PasswordField";
import { Text } from "../../ui/Text";
import { TextLink } from "../../ui/TextLink";
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
 *   can't tell them apart and never tries to. A request the limiter refuses
 *   (over the limit, or its store down) is «not sent», for any address alike
 *   (owner, 2026-11-20): the card says so instead of «check your email».
 * - Resend is locked for 60s, the countdown in the label. The disabled button
 *   stays focusable (`aria-disabled`, never `disabled`) and the reason is
 *   written next to it, not in a tooltip (KABINET "Buttons").
 * - «check your email» ends with a person to write to (IN-E7, IN-T9): the
 *   card can't say a send failed for one address and not another without
 *   telling a stranger which addresses exist, so the fallback is a human, not
 *   an error (the limiter's «not sent», above, comes before any lookup). The
 *   address is config (`EMAIL_REPLY_TO`, the same inbox every email's
 *   Reply-To names), passed in by the page, never typed into the copy.
 *
 * Built on the kit (Button, TextField, Heading, Card) and the unified tokens only.
 */

export const RESEND_LOCKOUT_SECONDS = 60;
export const SIGN_IN_PATH = "/api/auth/sign-in/magic-link";
/** Where the link lands after verification, and where a password sign-in goes: the cabinet's home. */
export const SIGN_IN_CALLBACK = SHELTER_HOME;

const countdown = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

type State =
  /** `error`: the one sentence the form shows after a try, or null. */
  | { kind: "entering"; error: string | null }
  | { kind: "sent"; email: string; lockedFor: number; resendFailed: string | null };

/** A link request's result: `not_sent` is the limiter's refusal, `failed` no answer or an error. */
export type LinkRequestOutcome = "sent" | "not_sent" | "failed";

/** The sentence for a link request that didn't go out. */
const linkFailureMessage = (outcome: Exclude<LinkRequestOutcome, "sent">): string =>
  outcome === "not_sent" ? uk.kabinet.signIn.notSent : uk.kabinet.signIn.sendFailed;

export function SignInCard({
  send = defaultSend,
  signIn = defaultSignIn,
  onSignedIn = defaultSignedIn,
  contact,
  footer,
  assistance,
}: {
  /** The strip inside the card's bottom (Update 3): the way to registration. */
  footer?: ReactNode;
  /** The help line under the card. */
  assistance?: ReactNode;
  /** The magic link; injected so tests drive the real component without a network. */
  send?: (email: string) => Promise<LinkRequestOutcome>;
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

  async function request(address: string): Promise<LinkRequestOutcome> {
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
      case "unavailable":
        // No wait to name: the approved «Забагато запитів. Спробуйте ще раз пізніше.».
        setState({ kind: "entering", error: uk.kabinet.forgot.throttled });
        return;
      case "no_answer":
        setState({ kind: "entering", error: uk.kabinet.signIn.failed });
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
    const outcome = await request(address);
    if (outcome === "sent") {
      pendingFocus.current = "title";
      setState({
        kind: "sent",
        email: address,
        lockedFor: RESEND_LOCKOUT_SECONDS,
        resendFailed: null,
      });
    } else {
      setState({ kind: "entering", error: linkFailureMessage(outcome) });
    }
  }

  async function onResend() {
    if (state.kind !== "sent" || state.lockedFor > 0 || busy) return;
    // A failed resend says so here, on this state: tapping «send again» and
    // seeing nothing change would read as sent (review of #93, finding 4).
    const outcome = await request(state.email);
    if (outcome === "sent") {
      setState({ ...state, lockedFor: RESEND_LOCKOUT_SECONDS, resendFailed: null });
    } else {
      setState({ ...state, resendFailed: linkFailureMessage(outcome) });
    }
  }

  function onOtherAddress() {
    pendingFocus.current = "email";
    setState({ kind: "entering", error: null });
  }

  if (state.kind === "entering") {
    // Update 3: the title above a ~440px card, «Забули пароль?» on the password's label row, the
    // link as a text button, the footer strip inside the card and the help line under it.
    return (
      <div className="flex w-full flex-col gap-6 tablet:w-110">
        <div className="flex flex-col gap-2 tablet:text-center">
          <Heading level={1} look="display-l" id={`${emailId}-title`} ref={titleRef} tabIndex={-1}>
            {uk.kabinet.signIn.title}
          </Heading>
          <Text look="body" className="text-ink-2">
            {uk.kabinet.signInPage.subtitle}
          </Text>
        </div>
        <Card as="section" tone="outline" aria-labelledby={`${emailId}-title`}>
          <div className="flex flex-col gap-6 p-5 tablet:p-8">
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
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
                showLabel={uk.kabinet.signIn.showPassword}
                hideLabel={uk.kabinet.signIn.hidePassword}
                labelAside={
                  <TextLink href={FORGOT_PATH} placement="standalone" className="text-body">
                    {uk.kabinet.signIn.forgot}
                  </TextLink>
                }
              />
              {state.error !== null ? (
                <p role="alert" className="text-label text-ink">
                  {state.error}
                </p>
              ) : null}
              <Button type="submit" status={busy ? "loading" : "idle"} className="w-full">
                {uk.kabinet.signIn.submitPassword}
              </Button>
            </form>
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={onSendLink}
                aria-busy={busy || undefined}
                className="inline-flex min-h-target cursor-pointer items-center text-body text-ink underline underline-offset-4 focus-ring"
              >
                {uk.kabinet.signIn.useLink}
              </button>
            </div>
          </div>
          {footer}
        </Card>
        {assistance}
      </div>
    );
  }

  return (
    <Card
      as="section"
      tone="outline"
      aria-labelledby={`${emailId}-title`}
      className="flex w-full flex-col gap-4 p-5 tablet:w-110 tablet:p-8"
    >
      {
        <div className="flex flex-col gap-4">
          <Heading level={1} look="title" id={`${emailId}-title`} ref={titleRef} tabIndex={-1}>
            {uk.kabinet.signIn.sentTitle}
          </Heading>
          <Text look="body" className="text-ink-2">
            {uk.kabinet.signIn.sentBody.split("{email}").map((part, index) =>
              index === 0 ? (
                part
              ) : (
                <span key="email">
                  <strong className="font-semibold text-ink">{state.email}</strong>
                  {part}
                </span>
              ),
            )}
          </Text>
          <Text look="hint">{uk.kabinet.signIn.spamNote}</Text>
          {contact !== null ? (
            <Text look="hint">
              {uk.kabinet.signInCard.notArrived.replaceAll("{contact}", () => contact)}
            </Text>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              onClick={onResend}
              aria-disabled={state.lockedFor > 0 || busy || undefined}
            >
              {state.lockedFor > 0
                ? uk.kabinet.signIn.resendIn.replace("{time}", countdown(state.lockedFor))
                : uk.kabinet.signIn.resend}
            </Button>
            <Button variant="ghost" onClick={onOtherAddress}>
              {uk.kabinet.signIn.otherAddress}
            </Button>
          </div>
          {state.resendFailed !== null ? (
            <p role="alert" className="text-label text-ink">
              {state.resendFailed}
            </p>
          ) : null}
        </div>
      }
    </Card>
  );
}

/** The magic link: the kabinet's own auth route, which answers 200 for any address it sends to. */
async function defaultSend(email: string): Promise<LinkRequestOutcome> {
  try {
    const response = await fetch(SIGN_IN_PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, callbackURL: SIGN_IN_CALLBACK }),
    });
    return linkRequestOutcomeOf(response.status, await response.json().catch(() => null));
  } catch {
    return "failed";
  }
}

/** Read from the status and the code only: the limiter's refusal has its own code. */
export function linkRequestOutcomeOf(status: number, body: unknown): LinkRequestOutcome {
  if (status >= 200 && status < 300) return "sent";
  const code =
    typeof body === "object" && body !== null ? (body as Record<string, unknown>).code : undefined;
  return status === 429 && code === SIGN_IN_LINK_NOT_SENT_CODE ? "not_sent" : "failed";
}

/** The password sign-in through the kabinet's auth route (`/api/auth/sign-in/email`). */
async function defaultSignIn(email: string, password: string): Promise<SignInOutcome> {
  return signInOutcomeOf(await postJson(PASSWORD_ENDPOINTS.signIn, { email, password }));
}

/** A full load of the cabinet's home, carrying the session cookie the answer set. */
function defaultSignedIn() {
  window.location.assign(SIGN_IN_CALLBACK);
}
