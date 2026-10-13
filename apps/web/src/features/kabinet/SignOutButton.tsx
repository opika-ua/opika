"use client";

import { uk } from "@opika/i18n";
import { useState } from "react";

/** Better Auth's sign-out, one of the four forwarded auth paths (`FORWARDED_AUTH_PATHS`). */
export const SIGN_OUT_PATH = "/api/auth/sign-out";
export const SIGNED_OUT_DESTINATION = "/kabinet/vkhid";

const FOCUS =
  "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px]";

async function defaultSignOut(): Promise<void> {
  await fetch(SIGN_OUT_PATH, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
}

/**
 * K4's «Вийти»: a text button (KABINET "Buttons", 48px target). Whatever the
 * response, the next stop is the sign-in page: a session that didn't end
 * still lands there, and the page itself re-checks it.
 */
export function SignOutButton({
  signOut = defaultSignOut,
  navigate = (to: string) => window.location.assign(to),
}: {
  signOut?: () => Promise<void>;
  navigate?: (to: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      aria-busy={busy}
      onClick={async () => {
        if (busy) return;
        setBusy(true);
        try {
          await signOut();
        } catch {
          // Nothing to tell the user here: the sign-in page re-checks the
          // session, so a sign-out that didn't land shows there honestly.
        }
        navigate(SIGNED_OUT_DESTINATION);
      }}
      className={`inline-flex min-h-12 items-center justify-center px-2 text-[15px] whitespace-nowrap text-rg-ink underline ${FOCUS}`}
    >
      {uk.kabinet.profile.signOut}
    </button>
  );
}
