import type { PauseReason } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import { BODY, CAPTION, STRONG } from "./styles";

const formatDate = (date: Date): string =>
  new Intl.DateTimeFormat("uk-UA", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Kyiv",
  }).format(date);

/**
 * While intake is paused: his paused line (the reason's label only, never
 * the note, fix 5) and, under it, the note labelled «Коментар» (K4-B4,
 * answer 2, Oleksii, verbatim: "show the pause note under the paused line,
 * labelled «Коментар», visible only to that shelter's admins (and
 * operator/support).").
 *
 * Only the kabinet renders this, and only that shelter's admins and the
 * operator's support view reach a shelter's kabinet page. No public view
 * carries the note (`views/shelter.test.ts` pins their fields). No hooks: the
 * editor and the read-only page both use it.
 */
export function PausedStatus({ since, reason }: { since: Date; reason: PauseReason }) {
  const t = uk.kabinet.profileEdit.pause;
  return (
    <div className="flex flex-col gap-2">
      <p className={BODY}>
        {fillTemplate(t.pausedLine, { date: formatDate(since), reason: t.reason[reason.code] })}
      </p>
      {reason.note !== null ? (
        <dl className="flex flex-col gap-1">
          <dt className={CAPTION}>{t.noteLabel}</dt>
          <dd className={`${STRONG} break-words`}>{reason.note}</dd>
        </dl>
      ) : null}
    </div>
  );
}
