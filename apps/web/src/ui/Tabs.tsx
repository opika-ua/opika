"use client";

import { type KeyboardEvent, type ReactNode, useId, useRef, useState } from "react";
import { cx } from "./cx";

/**
 * Tabs that switch panels in place (the ARIA tabs pattern): one tab stop for the list, Left/Right
 * arrows, Home and End move between tabs and select them, the panel is the tab's `aria-controls`.
 * For navigation between pages use links (BottomNav, Chip kind="link"), not Tabs. All panels are
 * rendered and the inactive ones hidden, so their content stays in the DOM (and in a no-JS render the
 * first panel is the visible one).
 */
export type TabItem = { id: string; label: string; panel: ReactNode };

export type TabsProps = {
  /** Names the tab list. */
  label: string;
  tabs: readonly TabItem[];
  defaultId?: string;
  className?: string;
};

export function Tabs({ label, tabs, defaultId, className }: TabsProps) {
  const base = useId();
  const [selected, setSelected] = useState(defaultId ?? tabs[0]?.id);
  const refs = useRef(new Map<string, HTMLButtonElement>());

  const move = (event: KeyboardEvent, index: number) => {
    const last = tabs.length - 1;
    const target =
      event.key === "ArrowRight"
        ? index === last
          ? 0
          : index + 1
        : event.key === "ArrowLeft"
          ? index === 0
            ? last
            : index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (target === null) return;
    event.preventDefault();
    const next = tabs[target];
    if (next === undefined) return;
    setSelected(next.id);
    refs.current.get(next.id)?.focus();
  };

  return (
    <div className={className}>
      <div role="tablist" aria-label={label} className="flex gap-1 rounded-pill bg-line p-1">
        {tabs.map((tab, index) => {
          const isSelected = tab.id === selected;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                if (node) refs.current.set(tab.id, node);
                else refs.current.delete(tab.id);
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${tab.id}`}
              aria-selected={isSelected}
              aria-controls={`${base}-panel-${tab.id}`}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => setSelected(tab.id)}
              onKeyDown={(event) => move(event, index)}
              className={cx(
                "min-h-target flex-1 cursor-pointer rounded-pill px-4 text-label focus-ring",
                isSelected ? "bg-ink text-on-ink" : "text-ink",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${base}-panel-${tab.id}`}
          aria-labelledby={`${base}-tab-${tab.id}`}
          hidden={tab.id !== selected}
          className="pt-4"
        >
          {tab.panel}
        </div>
      ))}
    </div>
  );
}
