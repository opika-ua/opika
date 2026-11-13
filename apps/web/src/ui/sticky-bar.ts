/**
 * How far the on-screen keyboard (or any browser UI) covers the bottom of the layout viewport, from
 * the VisualViewport API. A pinch-zoomed page also shrinks the visual viewport; that is not a
 * keyboard, so any zoom reports 0.
 */
export function keyboardInsetOf(measure: {
  layoutHeight: number;
  viewportHeight: number;
  viewportOffsetTop: number;
  scale: number;
}): number {
  if (measure.scale > 1.01) return 0;
  const covered = measure.layoutHeight - measure.viewportHeight - measure.viewportOffsetTop;
  // Sub-pixel differences are rounding, not a keyboard.
  return covered > 1 ? Math.round(covered) : 0;
}

const EDITABLE = "input, textarea, select, [contenteditable='true']";

/**
 * Scrolls the page so a focused field ends above the bar rather than under it. `scroll-padding` does
 * this in browsers that honour it on focus; this covers the rest. Only a form field counts: focusing
 * a button or link in the bar itself must not scroll the page.
 */
export function revealAboveBar(active: Element | null, barTop: number, margin = 16): void {
  if (active === null || !active.matches(EDITABLE)) return;
  const overlap = active.getBoundingClientRect().bottom + margin - barTop;
  if (overlap > 0) window.scrollBy({ top: overlap });
}

/**
 * Marks a bar fixed or sticky along the screen's bottom edge (the tab bar, a save bar). While a
 * toast shows, `ToastProvider` keeps it above every marked bar that is on screen.
 */
export const BOTTOM_BAR = { "data-bottom-bar": "" } as const;

const BOTTOM_BAR_SELECTOR = "[data-bottom-bar]";

export type BarBox = { top: number; bottom: number };

/**
 * How far above the screen's bottom edge a box `height` tall must sit to cross no bar: lifted over
 * every bar it would touch, again until none, so a bar stacked on another (a save bar resting on
 * the tab bar) is cleared too. A bar above the box, or off screen, leaves it where it is.
 */
export function liftAboveBars(
  bars: readonly BarBox[],
  viewportHeight: number,
  height: number,
): number {
  let lift = 0;
  for (let moved = true; moved; ) {
    moved = false;
    for (const bar of bars) {
      if (bar.top < viewportHeight - lift && bar.bottom > viewportHeight - lift - height) {
        lift = viewportHeight - bar.top;
        moved = true;
      }
    }
  }
  return lift;
}

/** The marked bars taking a place on screen now: fixed or sticky, and not hidden. */
export function bottomBarBoxes(root: ParentNode = document): BarBox[] {
  return Array.from(root.querySelectorAll<HTMLElement>(BOTTOM_BAR_SELECTOR)).flatMap((bar) => {
    const { position } = getComputedStyle(bar);
    if ((position !== "fixed" && position !== "sticky") || bar.getClientRects().length === 0) {
      return [];
    }
    const { top, bottom } = bar.getBoundingClientRect();
    return [{ top, bottom }];
  });
}

/** Calls `onChange` when any marked bar changes size; returns the disconnect. */
export function observeBottomBars(onChange: () => void, root: ParentNode = document): () => void {
  if (typeof ResizeObserver === "undefined") return () => {};
  const observer = new ResizeObserver(() => onChange());
  for (const bar of root.querySelectorAll(BOTTOM_BAR_SELECTOR)) observer.observe(bar);
  return () => observer.disconnect();
}
