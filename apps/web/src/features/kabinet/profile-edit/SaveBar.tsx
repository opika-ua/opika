"use client";

import { fillTemplate, uk } from "@opika/i18n";
import { Button } from "../../../ui/Button";
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
 * What a section says about its own save, in the flow under its fields: the caption that says when
 * a change shows (`actions.liveOnSave.*`), «Збережено.» (a polite live region that always exists, so
 * it is announced when it appears) with the time, and a failure or a conflict with its retry or
 * «Показати поточну версію». The buttons live in the page's one save bar (`PageSave`).
 */
export function SectionStatus({
  state,
  dirty,
  caption,
  onSave,
  onReload,
  viewHref,
}: {
  state: SaveState;
  dirty: boolean;
  /** `actions.liveOnSave.*`, when the section has one to show. */
  caption: string | null;
  onSave: () => void;
  onReload: () => void;
  /** The public page the change shows on; after a save a «Переглянути» link opens it in a new tab. */
  viewHref?: string;
}) {
  const t = uk.kabinet.profileEdit;
  const saved = state.kind === "saved" && !dirty;
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
    <div className="flex flex-col gap-2">
      {caption !== null ? <Text look="hint">{caption}</Text> : null}
      <p role="status" className="text-caption text-ink-2">
        {saved ? t.state.saved : null}
      </p>
      {saved ? (
        <Text look="hint">{fillTemplate(t.state.savedAt, { time: timeOf(state.at) })}</Text>
      ) : null}
      {saved && viewHref !== undefined ? (
        <a
          href={viewHref}
          target="_blank"
          rel="noopener"
          className="inline-flex min-h-target items-center self-start rounded-field text-label text-ink underline underline-offset-4 focus-ring"
        >
          {uk.kabinet.profileTabs.view}
          <span className="sr-only"> {uk.kabinet.shell.newTab}</span>
        </a>
      ) : null}
      {problem}
    </div>
  );
}
