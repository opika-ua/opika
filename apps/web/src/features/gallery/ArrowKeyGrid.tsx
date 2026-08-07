"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

interface ArrowKeyGridProps {
  className: string;
  children: ReactNode;
}

const CARD_SELECTOR = "[data-testid='animal-card']";

function cardsOf(grid: HTMLElement): HTMLElement[] {
  return Array.from(grid.querySelectorAll<HTMLElement>(CARD_SELECTOR));
}

function columnCountOf(grid: HTMLElement): number {
  // Read live, not computed from a breakpoint threshold duplicated in JS:
  // CSS Grid resolves `grid-template-columns` to one length per track
  // regardless of which Tailwind breakpoint variant matched, so this stays
  // correct across a resize with no listener of its own — the value is
  // read fresh on every keypress, not cached at mount (harness-verified: a
  // resize from desktop's 3 columns to phone's 1 mid-session changes what
  // ArrowDown does on the very next press, no remount required).
  const tracks = getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean);
  return tracks.length || 1;
}

/**
 * `docs/design/README.md`'s "Keyboard" table, issue #28 (E2.5): arrow keys
 * move focus by the grid's actual column count, Home/End jump to the
 * first/last card, edges never wrap.
 *
 * Deliberately does not touch any card's `tabIndex`, and deliberately does
 * not add `role="grid"`/`row`/`gridcell`. Both were tried first (a roving
 * tabindex, the APG grid pattern's usual pairing) and reverted on review:
 * issue #28 asks for that pattern's `tabIndex` half *and* for "Tab order
 * unaffected: still header → rail → sort → cards in reading order →
 * pagination" in the same breath, and a roving tabindex is exactly what
 * breaks the second promise — it makes one card the sole tab stop and
 * removes the other 23 from the Tab sequence, which is a real, visible
 * change to the design's own Tab row, not a cosmetic one. `docs/design/
 * README.md` is the authority `docs/standing-constraints.md` names for
 * exactly this kind of conflict, so its Tab row wins: every card keeps its
 * native tabIndex, Tab still visits all 24 in reading order exactly as
 * before this component existed, and arrow keys are a pure, additive
 * shortcut layered on top — `.focus()` works on any focusable element
 * regardless of tabIndex, so the 2D movement the Keyboard table asks for
 * doesn't need roving state to work. That also means no ARIA composite role
 * is needed: nothing about the underlying list-of-links semantics changed,
 * so screen readers keep exactly the experience they already had.
 *
 * A consequence worth stating plainly: JS-on and JS-off behave identically
 * here now — arrows are unavailable without JS, but Tab order was never
 * different between the two states to begin with, unlike the roving-
 * tabindex version this replaced (which needed its own JS-only-after-
 * hydration carve-out precisely because it changed Tab order in a way a
 * no-JS client could never do safely).
 */
export function ArrowKeyGrid({ className, children }: ArrowKeyGridProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const grid = ref.current;
    if (!grid) return;
    const gridEl: HTMLElement = grid;

    function onKeyDown(event: KeyboardEvent) {
      const cards = cardsOf(gridEl);
      const currentIndex = cards.indexOf(event.target as HTMLElement);
      if (currentIndex === -1) return;

      const columns = columnCountOf(gridEl);
      const isRowStart = currentIndex % columns === 0;
      const isRowEnd = currentIndex % columns === columns - 1;

      let nextIndex: number | null = null;
      switch (event.key) {
        case "ArrowRight":
          if (!isRowEnd && currentIndex + 1 < cards.length) nextIndex = currentIndex + 1;
          break;
        case "ArrowLeft":
          if (!isRowStart) nextIndex = currentIndex - 1;
          break;
        case "ArrowDown":
          if (currentIndex + columns < cards.length) nextIndex = currentIndex + columns;
          break;
        case "ArrowUp":
          if (currentIndex - columns >= 0) nextIndex = currentIndex - columns;
          break;
        case "Home":
          nextIndex = 0;
          break;
        case "End":
          nextIndex = cards.length - 1;
          break;
        default:
          return;
      }

      if (nextIndex === null || nextIndex === currentIndex) return;
      const next = cards[nextIndex];
      if (!next) return;

      event.preventDefault();
      next.focus();
    }

    // No re-run-on-data-change concern to design around: cardsOf(gridEl) is
    // read fresh on every keypress, not cached here, so a filter/sort/page
    // change that replaces the card set underneath this same, never-
    // remounted <main> is transparent to this listener — it just sees the
    // new cards on the next keypress. That's also why this component no
    // longer needs the caller to key it on the applied filter state: there
    // is no roving tabIndex left to go stale.
    gridEl.addEventListener("keydown", onKeyDown);
    return () => gridEl.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <main ref={ref} data-testid="gallery-grid" className={className}>
      {children}
    </main>
  );
}
