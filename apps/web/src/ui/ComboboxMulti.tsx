"use client";

import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { cx } from "./cx";
import { Icon } from "./Icon";
import { MultiSelectListbox, type MultiSelectRow, rowId } from "./MultiSelectRows";

/**
 * The multi-select mode of the kit combobox: a search field that picks several values from a list
 * the caller already holds (no request, so no loading state). Closed, it shows the label or the
 * chosen names with a count badge and a ✕; open, it is a text input over a listbox in the top
 * layer. Typed text never becomes a value, and on blur the field shows the choice again.
 * The single-value async `Combobox` is unchanged.
 *
 * The caller owns filtering and order (`rows`): it gets the query and the set of values that were
 * chosen when the list opened, so a row ticked now does not jump away under the pointer. Toggling
 * applies at once (`onToggle`); there is no Apply step.
 */
export type ComboboxMultiMessages = {
  /** Placeholder of the opened field. */
  search: string;
  clear: string;
  /** «Вибрано: 2»; also the badge's accessible name. */
  selectedCount: (count: number) => string;
  /** «Знайдено: 3», for a screen reader. */
  found: (count: number) => string;
  noMatch: string;
  /** A second sentence under `noMatch`; omitted when there is none to say. */
  noMatchHint?: string | undefined;
  /** Accessible name of the ✕ in the field. */
  clearField: string;
};

export type ComboboxMultiProps = {
  id: string;
  /** The field's visible label while nothing is chosen, and the list's name. */
  label: string;
  /** The chosen names, joined, for the closed field. */
  summary: string;
  selectedValues: readonly string[];
  rows: (query: string, pinned: ReadonlySet<string>) => readonly MultiSelectRow[];
  onToggle: (value: string) => void;
  onClear: () => void;
  messages: ComboboxMultiMessages;
  className?: string;
};

const PANEL_MIN_WIDTH = 320;
const EDGE = 8;

type PanelBox = { top: number; left: number; width: number; maxHeight: number };

function placePanel(field: HTMLElement): PanelBox {
  const rect = field.getBoundingClientRect();
  const width = Math.min(Math.max(rect.width, PANEL_MIN_WIDTH), window.innerWidth - 2 * EDGE);
  const left = Math.max(EDGE, Math.min(rect.left, window.innerWidth - width - EDGE));
  const top = rect.bottom + EDGE;
  return { top, left, width, maxHeight: Math.max(160, window.innerHeight - top - EDGE) };
}

export function ComboboxMulti({
  id,
  label,
  summary,
  selectedValues,
  rows: buildRows,
  onToggle,
  onClear,
  messages,
  className,
}: ComboboxMultiProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pinned, setPinned] = useState<ReadonlySet<string>>(() => new Set());
  const [activeValue, setActiveValue] = useState<string | null>(null);
  const [box, setBox] = useState<PanelBox | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();
  const idPrefix = `${id}-${listId}`;

  const rows = open ? buildRows(query, pinned) : [];
  const usable = rows.filter((row) => !row.disabled);
  const selectedCount = selectedValues.length;

  const openList = () => {
    if (open) return;
    setPinned(new Set(selectedValues));
    setQuery("");
    setActiveValue(null);
    setOpen(true);
  };
  const closeList = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveValue(null);
  }, []);

  // Top layer: a manual popover is never clipped by a container and sits above any z-index.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel) return;
    if (typeof panel.showPopover === "function" && !panel.matches(":popover-open")) {
      panel.showPopover();
    }
  }, [open]);

  // Positioned from the field, and again when the page scrolls or resizes under an open list.
  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!open || !field) return;
    const update = () => setBox(placePanel(field));
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) closeList();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, closeList]);

  const move = (step: 1 | -1) => {
    if (usable.length === 0) return;
    const at = usable.findIndex((row) => row.value === activeValue);
    const first = step === 1 ? 0 : usable.length - 1;
    const next = at < 0 ? first : (at + step + usable.length) % usable.length;
    const target = usable[next];
    if (!target) return;
    setActiveValue(target.value);
    document.getElementById(rowId(idPrefix, target.value))?.scrollIntoView?.({ block: "nearest" });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) openList();
        else move(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        if (!open) openList();
        else move(-1);
        break;
      case "Enter":
        if (!open) break;
        // A toggle, or nothing: Enter never submits a surrounding form while the list is open.
        event.preventDefault();
        if (activeValue !== null) onToggle(activeValue);
        break;
      case " ":
        // Space types a space once there is a query («Біла Церква»); on an empty field it toggles.
        if (open && query === "" && activeValue !== null) {
          event.preventDefault();
          onToggle(activeValue);
        }
        break;
      case "Escape":
        if (open) {
          event.preventDefault();
          event.stopPropagation();
          closeList();
        }
        break;
      case "Backspace": {
        if (query !== "") break;
        const last = selectedValues[selectedValues.length - 1];
        if (last !== undefined) onToggle(last);
        break;
      }
      default:
    }
  };

  const hasSelection = selectedCount > 0;
  const accessibleName = hasSelection ? `${label}: ${summary}` : label;
  const noRows = open && rows.length === 0;
  const activeId =
    open && activeValue !== null && rows.some((row) => row.value === activeValue)
      ? rowId(idPrefix, activeValue)
      : undefined;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: blur bubbles from the input and the footer; this only decides whether focus left the field.
    <div
      ref={rootRef}
      className={cx("relative min-w-0", className)}
      onBlur={(event) => {
        if (rootRef.current?.contains(event.relatedTarget as Node | null)) return;
        closeList();
      }}
    >
      <div
        ref={fieldRef}
        className={cx(
          "flex h-13 w-full min-w-0 items-center gap-2 rounded-field border-2 bg-surface pr-1 pl-5 text-label text-ink",
          hasSelection ? "border-ink" : open ? "border-accent" : "border-line",
        )}
      >
        <input
          id={id}
          type="text"
          role="combobox"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label={accessibleName}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? `${idPrefix}-listbox` : undefined}
          aria-activedescendant={activeId}
          // Closed: the label or the chosen names, ellipsised by the browser; open: the search hint.
          placeholder={open ? messages.search : hasSelection ? summary : label}
          value={open ? query : ""}
          onFocus={openList}
          onClick={openList}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveValue(null);
            if (!open) openList();
          }}
          onKeyDown={onKeyDown}
          className={cx(
            "h-full min-w-0 flex-1 cursor-pointer truncate bg-transparent text-label text-ink outline-none",
            open ? "placeholder:text-ink-2" : "placeholder:text-ink",
          )}
        />
        {selectedCount > 1 ? (
          <span
            role="img"
            aria-label={messages.selectedCount(selectedCount)}
            className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-pill bg-ink px-2 text-caption text-on-ink"
          >
            {selectedCount}
          </span>
        ) : null}
        {hasSelection ? (
          <button
            type="button"
            aria-label={messages.clearField}
            onPointerDown={(event) => event.preventDefault()}
            onClick={onClear}
            className="inline-flex size-target shrink-0 cursor-pointer items-center justify-center rounded-pill text-ink focus-ring"
          >
            <Icon name="close" size="md" />
          </button>
        ) : (
          <span
            aria-hidden="true"
            className={cx(
              "inline-flex size-target shrink-0 items-center justify-center",
              open && "rotate-180",
            )}
          >
            <Icon name="chevron-down" size="md" />
          </span>
        )}
      </div>

      {open ? (
        <div
          ref={panelRef}
          popover="manual"
          style={
            box
              ? { top: box.top, left: box.left, width: box.width, maxHeight: box.maxHeight }
              : undefined
          }
          className="fixed inset-auto m-0 flex flex-col overflow-hidden rounded-panel border-2 border-line bg-surface p-0 text-ink shadow-float"
        >
          {noRows ? (
            <div className="flex flex-col gap-1 px-5 py-4 text-body text-ink-2">
              <span>{messages.noMatch}</span>
              {messages.noMatchHint ? <span>{messages.noMatchHint}</span> : null}
            </div>
          ) : (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                <MultiSelectListbox
                  rows={rows}
                  idPrefix={idPrefix}
                  activeValue={activeValue}
                  onToggle={onToggle}
                  label={label}
                />
              </div>
              <div className="flex items-center justify-between gap-3 border-t-2 border-line px-5 py-1">
                <button
                  type="button"
                  disabled={!hasSelection}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={onClear}
                  className="inline-flex min-h-target cursor-pointer items-center text-label text-ink underline focus-ring disabled:cursor-not-allowed disabled:text-ink-2 disabled:no-underline"
                >
                  {messages.clear}
                </button>
                <span className="text-caption text-ink-2">
                  {messages.selectedCount(selectedCount)}
                </span>
              </div>
            </>
          )}
          <span role="status" className="sr-only">
            {query.trim() === "" ? "" : noRows ? messages.noMatch : messages.found(rows.length)}
          </span>
        </div>
      ) : null}
    </div>
  );
}
