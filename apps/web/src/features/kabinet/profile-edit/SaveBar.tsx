"use client";

import { fillTemplate, uk } from "@opika/i18n";
import { Button } from "../../controls/controls";
import { CAPTION, ERROR_TEXT } from "./styles";
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
 * holds unsaved edits (with nothing to save neither is offered, so there is
 * never a button that does nothing), then what happened. «Збережено.» goes
 * into a polite live region that always exists, so it is announced when it
 * appears; «Збережено о 14:32» stays under it. A failure keeps the edits in
 * the form and offers a retry; a conflict offers the current version.
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
  return (
    <div className="flex flex-col gap-3">
      {caption !== null ? <p className={CAPTION}>{caption}</p> : null}
      {dirty || busy ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            aria-busy={busy || undefined}
            onClick={() => {
              if (!busy) onSave();
            }}
          >
            {busy ? t.state.saving : t.actions.save}
          </Button>
          {!busy ? (
            <Button variant="text" onClick={onCancel}>
              {t.actions.cancel}
            </Button>
          ) : null}
        </div>
      ) : null}
      <p role="status" className={CAPTION}>
        {saved ? t.state.saved : null}
      </p>
      {saved ? (
        <p className={CAPTION}>{fillTemplate(t.state.savedAt, { time: timeOf(state.at) })}</p>
      ) : null}
      {state.kind === "failed" ? (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className={ERROR_TEXT}>{t.state.failed}</p>
          <Button variant="text" onClick={onSave}>
            {t.state.retry}
          </Button>
        </div>
      ) : null}
      {state.kind === "conflict" ? (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className={ERROR_TEXT}>{t.errors.conflict}</p>
          <Button variant="text" onClick={onReload}>
            {t.errors.conflictReload}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
