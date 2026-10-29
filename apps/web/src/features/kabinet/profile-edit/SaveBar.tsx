"use client";

import { fillTemplate, uk } from "@opika/i18n";
import { Button } from "../../../ui/Button";
import { StickyActionBar } from "../../../ui/StickyActionBar";
import { Text } from "../../../ui/Text";
import type { WriteFailure } from "./write-result";

/**
 * Where a section's save stands (answer 1: each section saves on its own).
 * `illegal_transition` never reaches a form section: only pause and resume
 * raise it.
 */
export type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: Date }
  | Exclude<WriteFailure, { kind: "illegal_transition" } | { kind: "no_answer" }>;

/** HH:mm in Kyiv: the time on the shelter's own clock, whatever the browser's zone. */
const timeOf = (date: Date): string =>
  new Intl.DateTimeFormat("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Kyiv",
  }).format(date);

/**
 * A section's save row: «Зберегти» and «Скасувати зміни» while the section
 * holds unsaved edits, in the kit's sticky bar so Save stays in reach while
 * the person types (a phone's keyboard covers the end of the section), then
 * what happened. With nothing to save neither button is offered, so there is
 * never a button that does nothing. «Збережено.» goes into a polite live
 * region that always exists, so it is announced when it appears; «Збережено
 * о 14:32» stays under it. A failure keeps the edits in the form and offers a
 * retry; a conflict offers the current version. Both sit in the bar while it
 * is shown, where the thumb just pressed Save.
 */
export function SaveBar({
  state,
  dirty,
  caption,
  onSave,
  onCancel,
  onReload,
}: {
  state: SaveState;
  dirty: boolean;
  /** `actions.liveOnSave.*`, when the section has one to show. */
  caption: string | null;
  onSave: () => void;
  onCancel: () => void;
  onReload: () => void;
}) {
  const t = uk.kabinet.profileEdit;
  const busy = state.kind === "saving";
  const saved = state.kind === "saved" && !dirty;
  const barShown = dirty || busy;

  const problem =
    state.kind === "failed" ? (
      <div role="alert" className="flex flex-col items-start gap-1">
        <p className="text-label text-ink">{t.state.failed}</p>
        <Button variant="ghost" onClick={onSave}>
          {t.state.retry}
        </Button>
      </div>
    ) : state.kind === "conflict" ? (
      <div role="alert" className="flex flex-col items-start gap-1">
        <p className="text-label text-ink">{t.errors.conflict}</p>
        <Button variant="ghost" onClick={onReload}>
          {t.errors.conflictReload}
        </Button>
      </div>
    ) : null;

  return (
    // `contents`: the sticky bar's containing block must be the whole section, not this wrapper.
    <div className="contents">
      {caption !== null ? <Text look="hint">{caption}</Text> : null}
      {barShown ? (
        <StickyActionBar>
          {problem}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              status={busy ? "loading" : "idle"}
              onClick={() => {
                if (!busy) onSave();
              }}
            >
              {busy ? t.state.saving : t.actions.save}
            </Button>
            {!busy ? (
              <Button variant="ghost" onClick={onCancel}>
                {t.actions.cancel}
              </Button>
            ) : null}
          </div>
        </StickyActionBar>
      ) : null}
      <p role="status" className="text-caption text-ink-2">
        {saved ? t.state.saved : null}
      </p>
      {saved ? (
        <Text look="hint">{fillTemplate(t.state.savedAt, { time: timeOf(state.at) })}</Text>
      ) : null}
      {barShown ? null : problem}
    </div>
  );
}
