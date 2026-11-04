import type { PauseCode } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import { Panel } from "../../ui/Panel";

/** `other` has no public label on purpose: the notice stands alone. */
export const publicPauseReasonLabel = (reason: PauseCode | null): string | null =>
  reason === null || reason === "other" ? null : uk.pause.reason[reason];

/**
 * The notice a paused shelter's pages show: the fixed sentence plus, for a labelled code, the
 * reason line. Reason label only; never the shelter's note, a date or who paused.
 */
export function PauseNotice({ reason }: { reason: PauseCode | null }) {
  const label = publicPauseReasonLabel(reason);
  return (
    <Panel tone="outline" data-testid="pause-notice" className="flex flex-col gap-1">
      <p className="text-body font-semibold">{uk.pause.notice}</p>
      {label !== null && (
        <p data-testid="pause-reason" className="text-body text-ink-2">
          {fillTemplate(uk.pause.reasonLine, { reason: label })}
        </p>
      )}
    </Panel>
  );
}
