"use client";

import { type KeyboardEvent, useRef } from "react";
import { cx } from "./cx";

export type FilterTab = {
  id: string;
  /** The visible name. */
  label: string;
  /** Shown after the name, lighter. */
  count: number;
  /** The tab's accessible name when the visible text alone says too little (name and count). */
  accessibleName: string;
};

/**
 * One row of underline tabs that filter one list (a count after each name). ARIA tabs with
 * automatic activation: one tab stop (the selected tab), Left/Right/Home/End move and select. The
 * page owns the panel: give it `role="tabpanel"` and `aria-labelledby={tabId(id)}` of the selected
 * tab. Scrolls sideways on a phone and keeps the 48px target; focus-visible on every tab.
 * The row clips vertically (no stray scrollbar) and is 44px of tab plus the 2px rule, so the focus
 * ring is drawn inset (`focus-ring-inset`) instead of needing padding. Pointer: `cursor-pointer`,
 * and hovering a tab turns its label ink and previews a light underline; the selected tab's is ink.
 */
export const filterTabId = (prefix: string, id: string): string => `${prefix}-tab-${id}`;

export function FilterTabs({
  label,
  idPrefix,
  tabs,
  value,
  onChange,
  panelId,
}: {
  label: string;
  idPrefix: string;
  tabs: readonly FilterTab[];
  value: string;
  onChange: (id: string) => void;
  panelId: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const move = (event: KeyboardEvent, index: number) => {
    const last = tabs.length - 1;
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % tabs.length
        : event.key === "ArrowLeft"
          ? (index - 1 + tabs.length) % tabs.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    const target = tabs[next];
    if (target === undefined) return;
    onChange(target.id);
    refs.current[target.id]?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label={label}
      className="-mx-4 mb-0.5 flex gap-6 overflow-x-auto overflow-y-hidden border-b-2 border-line px-4 tablet:mx-0 tablet:px-0"
    >
      {tabs.map((tab, index) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(node) => {
              refs.current[tab.id] = node;
            }}
            type="button"
            role="tab"
            id={filterTabId(idPrefix, tab.id)}
            aria-selected={selected}
            aria-controls={panelId}
            aria-label={tab.accessibleName}
            tabIndex={selected || (!tabs.some((t) => t.id === value) && index === 0) ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => move(event, index)}
            className={cx(
              "relative inline-flex h-11 shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap px-1 pb-1 text-label focus-ring-inset after:absolute after:inset-x-0 after:bottom-0 after:h-1",
              selected ? "text-ink after:bg-ink" : "text-ink-2 hover:text-ink hover:after:bg-line",
            )}
          >
            {tab.label}
            <span className="text-caption text-ink-2">{tab.count}</span>
          </button>
        );
      })}
    </div>
  );
}
