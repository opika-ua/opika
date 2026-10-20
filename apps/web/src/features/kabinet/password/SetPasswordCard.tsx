"use client";

import { fillTemplate, uk } from "@opika/i18n";
import { type FormEvent, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { buttonClass } from "../../controls/controls";
import { SHELTER_HOME, SIGN_IN_PAGE_PATH } from "../routes";
import { CARD_BODY, CARD_MESSAGE, CARD_TITLE, CardFrame } from "./CardFrame";
import { InviteUnusableCard } from "./InviteUnusableCard";
import { acceptWithPassword, type SetPasswordOutcome } from "./invitation-client";
import { NewPasswordFields } from "./NewPasswordFields";
import { refusalMessage } from "./password-copy";

/** The hidden field the link's token travels in, once it has left the address bar. */
const TOKEN_FIELD = "zaproshennia";

type State =
  | { kind: "entering"; refusal: string | null; mismatch: boolean; message: string | null }
  | { kind: "unusable" };

/**
 * «Створіть пароль» (PW-2, `docs/shelter-passwords.md` §4.2; his scope item 2, verbatim: "the
 * invite link opens «Створіть пароль» (password + repeat, show/hide). Single-use, 72h, bound to
 * the invited address. Accepting sets the password and signs in."). The page found the
 * invitation live and names its shelter and address (masked); the address isn't a field, since
 * the password is always for the invitation's own address.
 *
 * On success the browser goes to `/kabinet` with the session Better Auth just set; if the
 * password was set but the sign-in didn't go through (the sign-in delay), to the sign-in page,
 * where the new password now works. An answer that the link can't be used turns the card into the
 * page's one unusable state.
 */
export function SetPasswordCard({
  token,
  shelterName,
  maskedEmail,
  accept = acceptWithPassword,
  go = (path) => window.location.assign(path),
}: {
  token: string;
  shelterName: string;
  maskedEmail: string;
  /** Injected so tests drive the real component without a network. */
  accept?: (token: string, password: string) => Promise<SetPasswordOutcome>;
  /** A full navigation, so the next page is rendered with the new session cookie. */
  go?: (path: string) => void;
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

  useLayoutEffect(() => {
    if (state.kind === "unusable") titleRef.current?.focus();
  }, [state.kind]);

  // His PW1-V1 rule, extended to the invitation by his PW-2 Q3: once the page has read the token
  // (the `token` prop, now in the form's hidden field), the address bar, the history entry and
  // anything reading `location` see the bare path.
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
    let outcome: SetPasswordOutcome;
    try {
      outcome = await accept(typeof carried === "string" ? carried : "", password);
    } finally {
      setBusy(false);
    }
    switch (outcome.kind) {
      case "signed_in":
        go(SHELTER_HOME);
        return;
      case "password_set":
        go(SIGN_IN_PAGE_PATH);
        return;
      case "unusable":
        setState({ kind: "unusable" });
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

  if (state.kind === "unusable") return <InviteUnusableCard titleRef={titleRef} />;

  return (
    <CardFrame titleId={`${id}-title`}>
      <h1 id={`${id}-title`} ref={titleRef} tabIndex={-1} className={CARD_TITLE}>
        {uk.kabinet.setPassword.title}
      </h1>
      <p className={CARD_BODY}>
        {fillTemplate(uk.kabinet.setPassword.intro, { shelter: shelterName, email: maskedEmail })}
      </p>
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
          {uk.kabinet.setPassword.submit}
        </button>
      </form>
      <p role="alert" className={CARD_MESSAGE}>
        {state.message}
      </p>
    </CardFrame>
  );
}
