"use client";

import { uk } from "@opika/i18n";
import { useState } from "react";
import { Button } from "../../ui/Button";
import { Text } from "../../ui/Text";
import { confirmLeave as defaultConfirmLeave } from "./shared/unsaved-changes";

/** Better Auth's sign-out, one of the four forwarded auth paths (`FORWARDED_AUTH_PATHS`). */
export const SIGN_OUT_PATH = "/api/auth/sign-out";
export const SIGNED_OUT_DESTINATION = "/kabinet/vkhid";

async function defaultSignOut(): Promise<void> {
  const response = await fetch(SIGN_OUT_PATH, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  // A refused sign-out (a 5xx, a 503 when sign-in is off) is a failure too,
  // not only a network error.
  if (!response.ok) throw new Error(`Sign-out answered ${response.status}`);
}

/**
 * K4's «Вийти»: a text button (KABINET "Buttons", 48px target). Only a
 * sign-out that went through moves on to the sign-in page. One that failed
 * stays here and says so: on a shared computer, landing on a sign-in form
 * with the session still live would tell the next person nothing while
 * leaving them inside this shelter's cabinet (review of #93, finding 1).
 *
 * With unsaved K4 edits on the page it asks first (`actions.unsavedLeave`,
 * answer 1); without any, nothing is asked.
 */
export function SignOutButton({
  signOut = defaultSignOut,
  navigate = (to: string) => window.location.assign(to),
  confirmLeave = defaultConfirmLeave,
  variant = "button",
}: {
  signOut?: () => Promise<void>;
  navigate?: (to: string) => void;
  confirmLeave?: () => boolean;
  /** `menu`: a full-width row in the account menu; `button`: the outlined button. */
  variant?: "button" | "menu";
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <span className={variant === "menu" ? "flex flex-col" : "inline-flex flex-col items-end"}>
      <Button
        variant={variant === "menu" ? "ghost" : "secondary"}
        aria-busy={busy}
        onClick={async () => {
          if (busy) return;
          if (!confirmLeave()) return;
          setBusy(true);
          setFailed(false);
          try {
            await signOut();
          } catch {
            setFailed(true);
            setBusy(false);
            return;
          }
          navigate(SIGNED_OUT_DESTINATION);
        }}
        className={
          variant === "menu"
            ? "w-full justify-start rounded-field px-3 whitespace-nowrap no-underline"
            : "whitespace-nowrap"
        }
      >
        {uk.kabinet.profile.signOut}
      </Button>
      {failed ? (
        <div role="alert" className={variant === "menu" ? "max-w-80 px-3" : "max-w-80 text-right"}>
          <Text look="label">{uk.kabinet.profile.signOutFailed}</Text>
        </div>
      ) : null}
    </span>
  );
}
