"use client";

import { fillTemplate, uk } from "@opika/i18n";
import { type FormEvent, useId, useState } from "react";
import { buttonClass, TextField } from "../../controls/controls";
import { CARD_BODY, CARD_MESSAGE, CARD_TITLE, CardFrame } from "./CardFrame";
import { type ForgotOutcome, forgotOutcomeOf, PASSWORD_ENDPOINTS, postJson } from "./password-api";

/**
 * «Забули пароль?» (`/kabinet/vkhid/zabuly`, §6.3). One answer for every
 * address (`forgot.sent`, his «Якщо це адреса…», true for any address, the
 * operator's included): the server sends a link only to a shelter admin, and
 * this card can't tell, so it never tries to. `{minutes}` is the link's
 * lifetime, given by the page. After «sent» the form stays, so a person who
 * typed the wrong address can correct it (each try draws on the 3-an-hour
 * budget per address).
 */
export function ForgotPasswordCard({
  minutes,
  send = defaultSend,
}: {
  minutes: number;
  /** Injected so tests drive the real component without a network. */
  send?: (email: string) => Promise<ForgotOutcome>;
}) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ForgotOutcome | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      setOutcome(await send(email.trim()));
    } finally {
      setBusy(false);
    }
  }

  const message =
    outcome === null
      ? null
      : outcome.kind === "sent"
        ? fillTemplate(uk.kabinet.forgot.sent, { minutes: String(minutes) })
        : outcome.kind === "throttled"
          ? uk.kabinet.forgot.throttled
          : uk.kabinet.signIn.sendFailed;

  return (
    <CardFrame titleId={`${id}-title`}>
      <div className="flex flex-col gap-2">
        <h1 id={`${id}-title`} className={CARD_TITLE}>
          {uk.kabinet.forgot.title}
        </h1>
        <p className={CARD_BODY}>{uk.kabinet.forgot.intro}</p>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-6">
        <TextField
          id={`${id}-email`}
          label={uk.kabinet.signIn.emailLabel}
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <button type="submit" aria-disabled={busy || undefined} className={buttonClass("primary")}>
          {uk.kabinet.forgot.submit}
        </button>
      </form>
      <p role="status" className={CARD_MESSAGE}>
        {message}
      </p>
    </CardFrame>
  );
}

async function defaultSend(email: string): Promise<ForgotOutcome> {
  return forgotOutcomeOf(await postJson(PASSWORD_ENDPOINTS.forgot, { email }));
}
