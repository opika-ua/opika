import type { ReactNode } from "react";
import { cx } from "./cx";
import { Icon } from "./Icon";

/**
 * The rows of a multi-select list, shared by `ComboboxMulti` (a listbox under a desktop field) and
 * the phone's checklist screens. The caller prepares the rows (filtering, order, the matched parts
 * of the text); this draws them: a checkbox, the name, a second line for a shared name, and the
 * count at the right edge in tabular numbers. Each row is at least 48px tall.
 */
export type MultiSelectRow = {
  value: string;
  /** The label split around the matched part (`[before, matched, after]`); the middle is bold. */
  label: readonly [string, string, string];
  detail: readonly [string, string, string] | null;
  /** Printed at the right edge; omitted for a list without counts. */
  count: number | null;
  checked: boolean;
  disabled: boolean;
  /** The accessible name: the count is part of it, not a stray number after it. */
  name: string;
  /** Rows sharing a group id sit under one heading; null for an ungrouped list. */
  group: { id: string; label: string } | null;
};

const ROW =
  "flex min-h-target w-full items-center gap-3 rounded-field px-3 py-2 text-left text-body text-ink";
const ROW_ACTIVE = "bg-line";
const ROW_DISABLED = "cursor-not-allowed text-ink-2";

function Marked({ parts }: { parts: readonly [string, string, string] }) {
  const [before, matched, after] = parts;
  return (
    <>
      {before}
      {matched === "" ? null : <strong>{matched}</strong>}
      {after}
    </>
  );
}

function RowBody({ row }: { row: MultiSelectRow }) {
  return (
    <>
      <span
        aria-hidden="true"
        className={cx(
          "inline-flex size-5 shrink-0 items-center justify-center rounded-tag border-2",
          row.checked ? "border-ink bg-ink text-on-ink" : "border-line bg-surface",
        )}
      >
        {row.checked ? <Icon name="check" size="sm" /> : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">
          <Marked parts={row.label} />
        </span>
        {row.detail === null ? null : (
          <span className="truncate text-caption text-ink-2">
            <Marked parts={row.detail} />
          </span>
        )}
      </span>
      {row.count === null ? null : (
        <span aria-hidden="true" className="shrink-0 text-caption text-ink-2 tabular-nums">
          {row.count}
        </span>
      )}
    </>
  );
}

/** A heading between groups; the group itself carries the accessible name. */
function GroupHeading({ children }: { children: ReactNode }) {
  return (
    <div aria-hidden="true" className="px-3 pt-3 pb-1 text-caption text-ink-2">
      {children}
    </div>
  );
}

type Common = {
  rows: readonly MultiSelectRow[];
  idPrefix: string;
  /** The row the keyboard is on (listbox mode only). */
  activeValue?: string | null;
  onToggle: (value: string) => void;
  /** The accessible name of the whole list. */
  label: string;
};

function grouped(
  rows: readonly MultiSelectRow[],
): { id: string | null; label: string; rows: MultiSelectRow[] }[] {
  const out: { id: string | null; label: string; rows: MultiSelectRow[] }[] = [];
  for (const row of rows) {
    const id = row.group?.id ?? null;
    const last = out[out.length - 1];
    if (last && last.id === id) last.rows.push(row);
    else out.push({ id, label: row.group?.label ?? "", rows: [row] });
  }
  return out;
}

export const rowId = (prefix: string, value: string) => `${prefix}-opt-${value}`;

/** `role="listbox"` with `aria-multiselectable`: focus stays in the combobox input. */
export function MultiSelectListbox({ rows, idPrefix, activeValue, onToggle, label }: Common) {
  return (
    <div id={`${idPrefix}-listbox`} role="listbox" aria-multiselectable="true" aria-label={label}>
      {grouped(rows).map((section) => {
        const options = section.rows.map((row) => (
          // biome-ignore lint/a11y/useKeyWithClickEvents: the keyboard path is the input's (aria-activedescendant + Enter/Space).
          <div
            key={row.value}
            id={rowId(idPrefix, row.value)}
            role="option"
            tabIndex={-1}
            aria-selected={row.checked}
            aria-disabled={row.disabled || undefined}
            aria-label={row.name}
            data-active={row.value === activeValue}
            // Focus stays in the input: pressing a row must not blur it before the click lands.
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => {
              if (!row.disabled) onToggle(row.value);
            }}
            className={cx(
              ROW,
              row.disabled ? ROW_DISABLED : "cursor-pointer",
              row.value === activeValue && ROW_ACTIVE,
            )}
          >
            <RowBody row={row} />
          </div>
        ));
        return section.id === null ? (
          options
        ) : (
          // biome-ignore lint/a11y/useSemanticElements: a named group of listbox options has no native element
          <div key={section.id} role="group" aria-label={section.label}>
            <GroupHeading>{section.label}</GroupHeading>
            {options}
          </div>
        );
      })}
    </div>
  );
}

/** A plain list of checkbox buttons for touch: each row is a Tab stop, no combobox needed. */
export function MultiSelectChecklist({ rows, idPrefix, onToggle, label }: Common) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a group of checkbox rows has no native element short of a form fieldset
    <div id={`${idPrefix}-checklist`} role="group" aria-label={label}>
      {grouped(rows).map((section) => {
        const items = section.rows.map((row) => (
          // biome-ignore lint/a11y/useSemanticElements: a button with role=checkbox keeps the whole row one touch target
          <button
            key={row.value}
            type="button"
            role="checkbox"
            aria-checked={row.checked}
            aria-label={row.name}
            disabled={row.disabled}
            onClick={() => onToggle(row.value)}
            className={cx(
              ROW,
              row.disabled ? ROW_DISABLED : "cursor-pointer hover:bg-line",
              "focus-ring",
            )}
          >
            <RowBody row={row} />
          </button>
        ));
        return section.id === null ? (
          items
        ) : (
          // biome-ignore lint/a11y/useSemanticElements: a named group of rows; a fieldset would add form semantics
          <div key={section.id} role="group" aria-label={section.label}>
            <GroupHeading>{section.label}</GroupHeading>
            {items}
          </div>
        );
      })}
    </div>
  );
}
