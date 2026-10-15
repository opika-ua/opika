import { uk } from "@opika/i18n";

/**
 * `/kabinet` for a signed-in person whose invitation couldn't be accepted
 * this time (IN-Q12: "sees a clear message … and gets a retry"). The retry is
 * a plain link back to `/kabinet`, whose load runs the accept again. No mock
 * exists for this state: it reuses K1's card and type scale, nothing new
 * (Oleksii, IN-T12 item 7: "reuse K1's card (approved), with its own heading
 * key kabinet.confirm.joinFailedTitle").
 */
const FOCUS =
  "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px]";
const PRIMARY = `inline-flex min-h-14 w-full items-center justify-center rounded-rg-button bg-rg-ink px-6 text-[15px] font-medium whitespace-nowrap text-white ${FOCUS}`;
const TITLE =
  "text-2xl leading-7 font-bold tracking-[-0.02em] text-rg-ink tablet:text-[34px] tablet:leading-[38px] tablet:tracking-[-0.03em]";
const BODY = "text-[17px] leading-[26px] text-rg-ink-2";

export function JoinFailedCard() {
  return (
    <section
      aria-labelledby="join-failed-title"
      className="flex w-full flex-col gap-6 rounded-rg-card bg-rg-surface p-5 tablet:w-[480px] tablet:p-8"
    >
      <div className="flex flex-col gap-2">
        <h1 id="join-failed-title" className={TITLE}>
          {uk.kabinet.confirm.joinFailedTitle}
        </h1>
        <p role="alert" className={BODY}>
          {uk.kabinet.confirm.joinFailed}
        </p>
      </div>
      <a href="/kabinet" className={PRIMARY}>
        {uk.kabinet.confirm.joinRetry}
      </a>
    </section>
  );
}
