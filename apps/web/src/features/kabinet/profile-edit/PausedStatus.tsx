import type { PauseReason } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import { Text } from "../../../ui/Text";
import { formatDate } from "../ProfileParts";

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
      <Text look="body">
        {fillTemplate(t.pausedLine, { date: formatDate(since), reason: t.reason[reason.code] })}
      </Text>
      {reason.note !== null ? (
        <dl className="flex flex-col gap-1">
          <dt className="text-caption text-ink-2">{t.noteLabel}</dt>
          <dd className="text-label break-words text-ink">{reason.note}</dd>
        </dl>
      ) : null}
    </div>
  );
}
