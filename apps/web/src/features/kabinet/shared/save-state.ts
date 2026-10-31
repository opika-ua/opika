import { pluralizeUk } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";

/**
 * What the kabinet's save pill (desktop) or bar (phone) says. «Усі зміни збережено» and a draft's
 * autosave status are not here: they show only as the line under the tabs, never as a pill (a
 * draft saves itself, so there is nothing to act on).
 */
export type SaveBarState =
  | { kind: "unsaved" }
  | { kind: "saving" }
  | { kind: "saved"; at: Date; viewHref?: string }
  | { kind: "invalid"; count: number }
  | { kind: "failed" }
  /** A message with at most one action of its own, e.g. the existing conflict text and «Показати поточну версію». */
  | { kind: "blocked"; message: string; action?: { label: string; onPress: () => void } };

/** How long «Збережено о …» stays after a successful save. */
export const SAVED_PILL_MS = 4000;

/** HH:mm in Kyiv: the time on the shelter's own clock, whatever the browser's zone. */
export const savedTimeOf = (date: Date): string =>
  new Intl.DateTimeFormat("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Kyiv",
  }).format(date);

export function saveBarTextOf(state: SaveBarState): string {
  const t = uk.kabinet.profileEdit;
  switch (state.kind) {
    case "unsaved":
      return t.saveBar.unsaved;
    case "saving":
      return t.state.saving;
    case "saved":
      return fillTemplate(t.state.savedAt, { time: savedTimeOf(state.at) });
    case "invalid":
      return fillTemplate(pluralizeUk(state.count, t.saveBar.checkFields), {
        n: String(state.count),
      });
    case "failed":
      return t.saveBar.failed;
    case "blocked":
      return state.message;
  }
}

export type SaveTone = "ok" | "pending" | "error" | "busy";

/** The dot's tone, shared by the pill and the status line under the tabs. */
export const saveToneOf = (state: SaveBarState | null): SaveTone =>
  state === null || state.kind === "saved"
    ? "ok"
    : state.kind === "saving"
      ? "busy"
      : state.kind === "unsaved"
        ? "pending"
        : "error";
