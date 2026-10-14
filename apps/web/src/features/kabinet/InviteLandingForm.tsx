"use client";

import { uk } from "@opika/i18n";
import { useActionState, useEffect, useRef } from "react";
import { INVITE_LINK } from "../../kabinet/email-links";
import type { InviteLanding } from "../../kabinet/invite-landing";
import { InviteLandingCard } from "./InviteLandingCard";

/**
 * The invite landing before and after its one button (EM-Q3, Oleksii,
 * verbatim: "The invite landing shows one «Надіслати посилання» button; only
 * its POST sends. A GET sends nothing."). Before: K1's card with the page
 * title, one line and the button, nothing looked up, so it names no shelter
 * and says nothing about whether the invitation is live
 * (`kabinet/invite-landing.ts`). After: the button's answer in the same card.
 *
 * A plain `<form>` posting the server action: it works before hydration and
 * without JavaScript, where the browser posts the form itself.
 */

const FOCUS =
  "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px]";
const PRIMARY = `inline-flex min-h-14 w-full items-center justify-center rounded-rg-button bg-rg-ink px-6 text-[15px] font-medium whitespace-nowrap text-white ${FOCUS}`;
const TITLE =
  "text-2xl leading-7 font-bold tracking-[-0.02em] text-rg-ink tablet:text-[34px] tablet:leading-[38px] tablet:tracking-[-0.03em]";
const BODY = "text-[17px] leading-[26px] text-rg-ink-2";

export function InviteLandingForm({
  invitationId,
  action,
  minutes,
  contact,
}: {
  invitationId: string;
  /** `sendInviteLink`, injected so tests drive the real component without a server. */
  action: (previous: InviteLanding | null, form: FormData) => Promise<InviteLanding>;
  minutes: number;
  contact: string | null;
}) {
  const [landing, submit, pending] = useActionState(action, null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  // The card changes under the user once the answer arrives: focus its
  // heading, so a screen reader announces the new state, not a vanished button.
  useEffect(() => {
    if (landing !== null) titleRef.current?.focus();
  }, [landing]);

  if (landing !== null) {
    return (
      <InviteLandingCard
        landing={landing}
        minutes={minutes}
        contact={contact}
        titleRef={titleRef}
      />
    );
  }
  return (
    <section
      aria-labelledby="invite-landing-title"
      className="flex w-full flex-col gap-4 rounded-rg-card bg-rg-surface p-5 tablet:w-[480px] tablet:p-8"
    >
      <form
        action={submit}
        // One send per tap: a second press while the first is in flight
        // would spend another of the address's five links an hour.
        onSubmit={(event) => {
          if (pending) event.preventDefault();
        }}
        className="flex flex-col gap-6"
      >
        <div className="flex flex-col gap-2">
          <h1 id="invite-landing-title" className={TITLE}>
            {uk.kabinet.inviteLanding.pageTitle}
          </h1>
          <p className={BODY}>{uk.kabinet.inviteLanding.ready}</p>
        </div>
        <input type="hidden" name={INVITE_LINK.param} value={invitationId} />
        <button type="submit" aria-disabled={pending || undefined} className={PRIMARY}>
          {uk.kabinet.inviteLanding.send}
        </button>
      </form>
    </section>
  );
}
