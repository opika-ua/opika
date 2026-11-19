"use client";

import { useState } from "react";
import { Text } from "../../ui/Text";

/** Better Auth's sign-out (a forwarded auth path, not a /kabinet page). */
const SIGN_OUT_PATH = "/api/auth/sign-out";

async function defaultSignOut(): Promise<void> {
  const response = await fetch(SIGN_OUT_PATH, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  if (!response.ok) throw new Error(`Sign-out answered ${response.status}`);
}

/**
 * A2's «Вийти» on /prytulkam: signs out and reloads, so the page shows the form. A refused sign-out
 * stays and says so (the session is still live).
 */
export function RegistrationSignOut({
  label,
  failed: failedText,
  signOut = defaultSignOut,
  reload = () => window.location.reload(),
}: {
  label: string;
  failed: string;
  signOut?: () => Promise<void>;
  reload?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <span className="flex flex-col items-center gap-1">
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
          reload();
        }}
        className="inline-flex min-h-target cursor-pointer items-center text-body text-ink underline underline-offset-4 focus-ring"
      >
        {label}
      </button>
      {failed ? (
        <span role="alert">
          <Text look="label" as="span">
            {failedText}
          </Text>
        </span>
      ) : null}
    </span>
  );
}
