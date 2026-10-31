import { uk } from "@opika/i18n";
import { Heading } from "../../ui/Heading";
import { Text } from "../../ui/Text";
import {
  MEDICAL_VALUE_TEXT,
  type MedicalRow,
  type MedicalValue,
  rowSource,
  sharedSource,
} from "./medical-labels";

const VALUE_DOT: Record<MedicalValue, string> = {
  done: "bg-species-dog",
  not_done: "bg-accent",
  unknown: "bg-muted",
};

/** «Медичний стан»: one row per stored health fact (the «Не записано» rule: every fact always
 * shows, «Невідомо» included), the source, then the shelter's own notes in full. */
export function MedicalStatus({
  rows,
  notes,
}: {
  rows: readonly MedicalRow[];
  notes: string | null;
}) {
  const shared = sharedSource(rows);
  const hasNotes = notes !== null && notes.trim() !== "";
  return (
    <div className="flex flex-1 flex-col gap-3">
      <Heading level={2}>{uk.detail.medicalHeading}</Heading>
      <dl className="m-0 flex flex-col rounded-field border-2 border-line bg-surface">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-4 border-line px-4 py-3 not-first:border-t-2"
          >
            <div className="flex min-w-0 flex-col">
              <dt className="text-body text-ink">{row.label}</dt>
              {shared === null && <dd className="text-caption text-ink-2">{rowSource(row)}</dd>}
            </div>
            <dd className="m-0 flex shrink-0 items-center gap-2 text-label text-ink">
              <span aria-hidden="true" className={`size-2 rounded-pill ${VALUE_DOT[row.value]}`} />
              {MEDICAL_VALUE_TEXT[row.value]}
            </dd>
          </div>
        ))}
      </dl>
      {shared !== null && <Text look="hint">{shared}</Text>}
      {hasNotes && (
        <Text look="lead" className="border-line border-t pt-3 text-ink-2 break-words">
          {notes}
        </Text>
      )}
    </div>
  );
}
