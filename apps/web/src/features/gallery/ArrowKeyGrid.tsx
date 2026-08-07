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
  // read fresh on every keypress, not cached at mount.
  const tracks = getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean);
  return tracks.length || 1;
}

/**
 * `docs/design/README.md`'s "Keyboard" table, issue #28 (E2.5): arrow keys
 * move focus by the grid's actual column count, Home/End jump to the first/
 * last card, edges never wrap. Independent of ARIA role — the design
 * specifies the *behaviour*, not `role="grid"`, and this deliberately does
 * not add `role="grid"`/`row`/`gridcell`: the ticket's own scope says "Tab
 * order unaffected... cards in reading order", i.e. the underlying semantics
 * stay a plain list of links, screen readers hear the same composed
 * `aria-label` per card they already do — only sighted keyboard users gain
 * the spatial shortcut. A judgement call, not a design value contradicted
 * either way; stated in the PR rather than decided silently.
 *
 * `docs/standing-constraints.md`'s "roving tabindex is client-side, after
 * hydration, only" (issue #28's own stated constraint): this component *is*
 * the grid's `<main>` — not a wrapper around a server-rendered one — so its
 * ref reaches the real DOM without an extra layer, but the tabIndex writes
 * themselves happen inside `useEffect`, never during render, so the HTML
 * this ships to a client with JS disabled (or one that hasn't hydrated yet)
 * has no card at `tabIndex="-1"` — every card stays reachable by Tab by
 * default, and roving focus is layered on top once mounted.
 */
export function ArrowKeyGrid({ className, children }: ArrowKeyGridProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const grid = ref.current;
    if (!grid) return;
    const gridEl: HTMLElement = grid;

    const initialCards = cardsOf(gridEl);
    if (initialCards.length === 0) return;

    // Roving tabindex starts at whichever card already has focus (a
    // same-page navigation shouldn't steal it), falling back to the first.
    const activeIndex = initialCards.indexOf(document.activeElement as HTMLElement);
    const initialIndex = activeIndex >= 0 ? activeIndex : 0;
    for (const [i, card] of initialCards.entries()) {
      card.tabIndex = i === initialIndex ? 0 : -1;
    }

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
      const current = cards[currentIndex];
      const next = cards[nextIndex];
      if (!current || !next) return;

      event.preventDefault();
      current.tabIndex = -1;
      next.tabIndex = 0;
      next.focus();
    }

    gridEl.addEventListener("keydown", onKeyDown);
    return () => gridEl.removeEventListener("keydown", onKeyDown);
    // Empty deps deliberately: this effect re-runs whenever this component
    // instance is freshly *mounted*, not on every re-render — the caller
    // keys ArrowKeyGrid on the applied filter/sort/page state, so a real
    // data change forces React to discard the old instance and mount a new
    // one, giving a fresh effect over the new card set. A dependency array
    // reacting to prop changes on the same instance is the wrong tool here:
    // `children` changes on every Server Component re-render regardless of
    // whether the animal list actually did.
  }, []);

  return (
    <main ref={ref} data-testid="gallery-grid" className={className}>
      {children}
    </main>
  );
}
