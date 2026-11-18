"use client";

import { fillTemplate, uk } from "@opika/i18n";
import { useState, useTransition } from "react";
import { OPERATOR_CONTACT } from "../../../brand";
import type { ResendResult } from "../../../kabinet/registration/resend-confirmation";
import { Button } from "../../../ui/Button";
import { InlineStatus } from "../../../ui/feedback";

/** What each answer tells the registrant; `not_needed` says nothing (the banner goes on reload). */
const STATUS: Record<
  Exclude<ResendResult["kind"], "not_needed">,
  { tone: "info" | "error"; text: string }
> = {
  sent: { tone: "info", text: uk.kabinet.signIn.sentTitle },
  rate_limited: { tone: "error", text: uk.registration.errors.rateLimited },
  // The form's own refusal at the cap, reused (owner's text).
  daily_cap: {
    tone: "error",
    text: fillTemplate(uk.registration.errors.dailyCap, { email: OPERATOR_CONTACT.email }),
  },
  failed: { tone: "error", text: uk.kabinet.signIn.sendFailed },
};

/**
 * «Надіслати ще раз» in the «Підтвердіть email» banner (Agent 3 places it through
 * `ResendConfirmation`). One press at a time; the answer is announced beside the button.
 */
export function ResendConfirmationButton({ action }: { action: () => Promise<ResendResult> }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ResendResult | null>(null);
  const status = result === null || result.kind === "not_needed" ? null : STATUS[result.kind];
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="secondary"
        status={pending ? "loading" : "idle"}
        className="self-start"
        onClick={() =>
          startTransition(async () => {
            setResult(await action().catch((): ResendResult => ({ kind: "failed" })));
          })
        }
      >
        {uk.kabinet.application.confirmEmailResend}
      </Button>
      {status === null ? null : <InlineStatus tone={status.tone}>{status.text}</InlineStatus>}
    </div>
  );
}
