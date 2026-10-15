import { uk } from "@opika/i18n";
import type { Ref } from "react";
import type { InviteLanding } from "../../kabinet/invite-landing";

/**
 * The invite landing's answer card (KS-Q2, Oleksii: "A"): K1's N1 card,
 * titled for the invitation, with no address field. It renders what the
 * button's POST answered (EM-Q3; the button itself is `InviteLandingForm`).
 * The «check your email» state names the invited address masked and ends,
 * like K1's, with a person to write to (IN-T9). No mock frame exists for this
 * page; KS-Q2 A is the specification.
 *
 * Nothing on it changes after it renders; `titleRef` lets the form move focus
 * to its heading when it replaces the button.
 */

/** Where an already-accepted invitee signs in: K1. */
export const SIGN_IN_PAGE = "/kabinet/vkhid";

const FOCUS =
  "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px]";
const TITLE =
  "text-2xl leading-7 font-bold tracking-[-0.02em] text-rg-ink tablet:text-[34px] tablet:leading-[38px] tablet:tracking-[-0.03em]";
const BODY = "text-[17px] leading-[26px] text-rg-ink-2";
const CAPTION = "text-[13px] leading-[18px] text-rg-ink-3";
const LINK = `inline-flex min-h-14 items-center self-start text-[15px] text-rg-ink underline ${FOCUS}`;

export function InviteLandingCard({
  landing,
  minutes,
  contact,
  titleRef,
}: {
  landing: InviteLanding;
  /** The magic link's lifetime, filled into the «sent» line. */
  minutes: number;
  /** `EMAIL_REPLY_TO`, as on K1's card; null leaves the fallback line out. */
  contact: string | null;
  /** The heading, whichever state renders; focusable from script only. */
  titleRef?: Ref<HTMLHeadingElement>;
}) {
  const t = uk.kabinet.inviteLanding;
  const titleFor = (shelterName: string) => t.title.replaceAll("{shelter}", shelterName);
  return (
    <section className="flex w-full flex-col gap-4 rounded-rg-card bg-rg-surface p-5 tablet:w-[480px] tablet:p-8">
      {landing.kind === "sent" ? (
        <>
          <h1 ref={titleRef} tabIndex={-1} className={TITLE}>
            {titleFor(landing.shelterName)}
          </h1>
          <p className={BODY}>
            {t.sent
              .replaceAll("{minutes}", String(minutes))
              .split("{email}")
              .map((part, index) =>
                index === 0 ? (
                  part
                ) : (
                  <span key="email">
                    <strong className="font-medium">{landing.maskedEmail}</strong>
                    {part}
                  </span>
                ),
              )}
          </p>
          <p className={CAPTION}>{uk.kabinet.signIn.spamNote}</p>
          {contact !== null ? (
            <p className={CAPTION}>
              {uk.kabinet.signInCard.notArrived.replaceAll("{contact}", contact)}
            </p>
          ) : null}
        </>
      ) : landing.kind === "send_failed" ? (
        <>
          <h1 ref={titleRef} tabIndex={-1} className={TITLE}>
            {titleFor(landing.shelterName)}
          </h1>
          <p role="alert" className="text-[15px] leading-[22px] font-medium text-rg-ink">
            {uk.kabinet.signIn.sendFailed}
          </p>
        </>
      ) : landing.kind === "already_accepted" ? (
        <>
          <h1 ref={titleRef} tabIndex={-1} className={TITLE}>
            {t.pageTitle}
          </h1>
          <p className={BODY}>{t.alreadyAccepted}</p>
          <a href={SIGN_IN_PAGE} className={LINK}>
            {t.signIn}
          </a>
        </>
      ) : landing.kind === "rate_limited" ? (
        <>
          <h1 ref={titleRef} tabIndex={-1} className={TITLE}>
            {t.pageTitle}
          </h1>
          <p className={BODY}>{t.rateLimited}</p>
        </>
      ) : (
        <>
          <h1 ref={titleRef} tabIndex={-1} className={TITLE}>
            {t.unusableTitle}
          </h1>
          <p className={BODY}>{t.expired}</p>
        </>
      )}
    </section>
  );
}
