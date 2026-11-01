"use client";

import { fillTemplate, uk } from "@opika/i18n";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { SavePill, SaveStatusLine } from "./save-pill";
import { type SaveBarState, saveBarTextOf, savedTimeOf } from "./save-state";

/**
 * One save bar for the whole Притулок page. Each editable section (contacts, the sentence) reports
 * whether it holds unsaved edits and hands over what «Зберегти» and «Скасувати» do for it; the pill
 * or bar (`SavePill`), shown only while something needs acting on, runs them together. Saves run
 * one after another, because every write answers with the new version the next one has to send.
 * The sections stay mounted under hidden sub-tabs, so switching tabs never loses an edit.
 */
export type SectionResult =
  | { kind: "ok" }
  /** The section refused for what is in its fields; `count` of them need fixing. */
  | { kind: "invalid"; count: number }
  | { kind: "failed" }
  /** The page changed elsewhere; the section offers the current version through `reload`. */
  | { kind: "conflict" };

type Controls = {
  save: () => Promise<SectionResult>;
  cancel: () => void;
  /** Takes the section to the current stored version (the conflict action). */
  reload?: () => void;
  /** Focuses the first field that needs fixing; the section's tab is already showing. */
  focusProblem?: () => void;
};

type Registry = {
  register: (id: string, controls: { current: Controls }) => void;
  unregister: (id: string) => void;
  setDirty: (id: string, dirty: boolean) => void;
};

type Status = { message: string | null; state: SaveBarState | null };

const NO_REGISTRY: Registry = { register: () => {}, unregister: () => {}, setDirty: () => {} };
const PageSaveContext = createContext<Registry>(NO_REGISTRY);
const StatusContext = createContext<Status>({ message: null, state: null });

/** The status line under the tabs; pass it to `Tabs`' `status`. Empty outside a `PageSave`. */
export function PageSaveStatus() {
  const { message, state } = useContext(StatusContext);
  return <SaveStatusLine message={message} state={state} />;
}

/** Ties a section to the page bar. Outside a `PageSave` it does nothing. */
export function useSectionControls(id: string, dirty: boolean, controls: Controls): void {
  const registry = useContext(PageSaveContext);
  const ref = useRef(controls);
  ref.current = controls;
  useEffect(() => {
    registry.register(id, ref);
    return () => registry.unregister(id);
  }, [registry, id]);
  // A layout effect: a save's answer commits outside any event, and React paints before passive
  // effects, so the bar stayed up beside «Збережено.» for a frame.
  useLayoutEffect(() => {
    registry.setDirty(id, dirty);
  }, [registry, id, dirty]);
}

type Phase =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: Date; showing: boolean }
  | { kind: "invalid"; id: string; count: number }
  | { kind: "failed" }
  | { kind: "conflict"; id: string };

export function PageSave({
  children,
  onProblem,
  viewHref,
}: {
  children: ReactNode;
  /** Called with the id of the section that refused or failed, so the page can show the tab it is on. */
  onProblem?: (id: string) => void;
  /** The public page the change shows on, for «Переглянути» after a save. */
  viewHref?: string;
}) {
  const t = uk.kabinet.profileEdit;
  const controls = useRef(new Map<string, { current: Controls }>());
  const [dirtyIds, setDirtyIds] = useState<ReadonlySet<string>>(new Set());
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  // Set by «Показати»; the effect below focuses once the section's tab is on screen.
  const [focusTick, setFocusTick] = useState(0);
  const focusId = useRef<string | null>(null);

  const registry = useMemo<Registry>(
    () => ({
      register: (id, c) => void controls.current.set(id, c),
      unregister: (id) => {
        controls.current.delete(id);
        setDirtyIds((ids) => {
          if (!ids.has(id)) return ids;
          const next = new Set(ids);
          next.delete(id);
          return next;
        });
      },
      setDirty: (id, dirty) =>
        setDirtyIds((ids) => {
          if (ids.has(id) === dirty) return ids;
          const next = new Set(ids);
          if (dirty) next.add(id);
          else next.delete(id);
          return next;
        }),
    }),
    [],
  );

  const dirty = dirtyIds.size > 0;
  const saveAll = useCallback(async () => {
    setPhase({ kind: "saving" });
    for (const [id, c] of controls.current) {
      if (!dirtyIds.has(id)) continue;
      const result = await c.current.save();
      if (result.kind === "ok") continue;
      setPhase(
        result.kind === "invalid"
          ? { kind: "invalid", id, count: result.count }
          : result.kind === "conflict"
            ? { kind: "conflict", id }
            : { kind: "failed" },
      );
      onProblem?.(id);
      return;
    }
    setPhase({ kind: "saved", at: new Date(), showing: true });
  }, [dirtyIds, onProblem]);
  const cancelAll = () => {
    for (const [id, c] of controls.current) if (dirtyIds.has(id)) c.current.cancel();
    setPhase({ kind: "idle" });
  };
  const showProblem = (id: string) => {
    onProblem?.(id);
    focusId.current = id;
    setFocusTick((n) => n + 1);
  };
  useEffect(() => {
    const id = focusId.current;
    if (id === null) return;
    focusId.current = null;
    controls.current.get(id)?.current.focusProblem?.();
  }, [focusTick]);

  // A problem belongs to unsaved edits: once they are all gone (reverted by hand) it goes too, and
  // any new edit replaces the confirmation at once.
  let state: SaveBarState | null = null;
  if (phase.kind === "saving") state = { kind: "saving" };
  else if (dirty && phase.kind === "failed") state = { kind: "failed" };
  else if (dirty && phase.kind === "invalid") state = { kind: "invalid", count: phase.count };
  else if (dirty && phase.kind === "conflict") {
    const id = phase.id;
    state = {
      kind: "blocked",
      message: t.errors.conflict,
      action: {
        label: t.errors.conflictReload,
        onPress: () => {
          controls.current.get(id)?.current.reload?.();
          setPhase({ kind: "idle" });
        },
      },
    };
  } else if (dirty) state = { kind: "unsaved" };
  else if (phase.kind === "saved" && phase.showing) {
    state = { kind: "saved", at: phase.at, ...(viewHref === undefined ? {} : { viewHref }) };
  }
  const message =
    state !== null
      ? saveBarTextOf(state)
      : phase.kind === "saved"
        ? fillTemplate(t.state.savedAt, { time: savedTimeOf(phase.at) })
        : t.saveBar.allSaved;

  return (
    <PageSaveContext.Provider value={registry}>
      <StatusContext.Provider value={{ message, state }}>
        {children}
        <SavePill
          state={state}
          onSave={() => void saveAll()}
          onRetry={() => void saveAll()}
          onCancel={cancelAll}
          onShow={() => {
            if (phase.kind === "invalid") showProblem(phase.id);
          }}
          onSavedElapsed={() =>
            setPhase((current) =>
              current.kind === "saved" ? { ...current, showing: false } : current,
            )
          }
        />
      </StatusContext.Provider>
    </PageSaveContext.Provider>
  );
}
