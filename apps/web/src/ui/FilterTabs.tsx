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
      className="-mx-4 flex gap-6 overflow-x-auto border-b-2 border-line px-4 tablet:mx-0 tablet:px-0"
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
              "-mb-0.5 inline-flex min-h-target shrink-0 items-center gap-1 whitespace-nowrap border-b-4 px-1 text-label focus-ring",
              selected ? "border-ink text-ink" : "border-transparent text-ink-2",
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
