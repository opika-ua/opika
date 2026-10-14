"use client";

import { uk } from "@opika/i18n";
import { useState } from "react";

/** Better Auth's sign-out, one of the four forwarded auth paths (`FORWARDED_AUTH_PATHS`). */
export const SIGN_OUT_PATH = "/api/auth/sign-out";
export const SIGNED_OUT_DESTINATION = "/kabinet/vkhid";

const FOCUS =
  "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px]";

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
 */
export function SignOutButton({
  signOut = defaultSignOut,
  navigate = (to: string) => window.location.assign(to),
}: {
  signOut?: () => Promise<void>;
  navigate?: (to: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        aria-busy={busy}
        onClick={async () => {
          if (busy) return;
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
        className={`inline-flex min-h-12 items-center justify-center px-2 text-[15px] whitespace-nowrap text-rg-ink underline ${FOCUS}`}
      >
        {uk.kabinet.profile.signOut}
      </button>
      {failed ? (
        <p
          role="alert"
          className="max-w-[320px] text-right text-[15px] leading-[22px] font-medium text-rg-ink"
        >
          {uk.kabinet.profile.signOutFailed}
        </p>
      ) : null}
    </span>
  );
}
