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
