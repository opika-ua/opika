"use client";

import { uk } from "@opika/i18n";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { BarButton, StickyActionBar } from "../../../ui/StickyActionBar";

/**
 * One save bar for the whole Притулок page. Each editable section (contacts, the sentence) reports
 * whether it holds unsaved edits and hands over what «Зберегти» and «Скасувати» do for it; the bar,
 * shown only while any section is dirty, runs them together. Saves run one after another, because
 * every write answers with the new version the next one has to send. The sections stay mounted
 * under hidden sub-tabs, so switching tabs never loses an edit.
 */
type Controls = {
  /** Resolves true when the section saved (or had nothing to save), false when it refused or failed. */
  save: () => Promise<boolean>;
  cancel: () => void;
};

type Registry = {
  register: (id: string, controls: { current: Controls }) => void;
  unregister: (id: string) => void;
  setDirty: (id: string, dirty: boolean) => void;
};

const NO_REGISTRY: Registry = { register: () => {}, unregister: () => {}, setDirty: () => {} };
const PageSaveContext = createContext<Registry>(NO_REGISTRY);

/** Ties a section to the page bar. Outside a `PageSave` it does nothing. */
export function useSectionControls(id: string, dirty: boolean, controls: Controls): void {
  const registry = useContext(PageSaveContext);
  const ref = useRef(controls);
  ref.current = controls;
  useEffect(() => {
    registry.register(id, ref);
    return () => registry.unregister(id);
  }, [registry, id]);
  useEffect(() => {
    registry.setDirty(id, dirty);
  }, [registry, id, dirty]);
}

export function PageSave({
  children,
  onProblem,
}: {
  children: ReactNode;
  /** Called with the id of the section that refused or failed, so the page can show the tab it is on. */
  onProblem?: (id: string) => void;
}) {
  const t = uk.kabinet.profileEdit;
  const controls = useRef(new Map<string, { current: Controls }>());
  const [dirtyIds, setDirtyIds] = useState<ReadonlySet<string>>(new Set());
  const [phase, setPhase] = useState<"idle" | "saving" | "failed">("idle");

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
    setPhase("saving");
    for (const [id, c] of controls.current) {
      if (!dirtyIds.has(id)) continue;
      if (!(await c.current.save())) {
        setPhase("failed");
        onProblem?.(id);
        return;
      }
    }
    setPhase("idle");
  }, [dirtyIds, onProblem]);
  const cancelAll = () => {
    for (const [id, c] of controls.current) if (dirtyIds.has(id)) c.current.cancel();
    setPhase("idle");
  };

  return (
    <PageSaveContext.Provider value={registry}>
      {/* Always in the DOM, so the bar appearing is announced politely without moving focus. */}
      <p role="status" className="sr-only">
        {dirty ? t.saveBar.unsaved : null}
      </p>
      {children}
      {dirty || phase === "saving" ? (
        <StickyActionBar tone="ink">
          <p role={phase === "failed" ? "alert" : undefined} className="min-w-0 flex-1 text-label">
            {phase === "failed" ? t.state.failed : t.saveBar.unsaved}
          </p>
          <div className="flex items-center gap-2">
            {phase !== "saving" ? (
              <BarButton kind="text" onClick={cancelAll}>
                {t.saveBar.cancel}
              </BarButton>
            ) : null}
            <BarButton
              kind="pill"
              aria-disabled={phase === "saving" || undefined}
              onClick={() => {
                if (phase !== "saving") void saveAll();
              }}
            >
              {phase === "saving" ? t.state.saving : t.actions.save}
            </BarButton>
          </div>
        </StickyActionBar>
      ) : null}
    </PageSaveContext.Provider>
  );
}
