/**
 * One scroll lock on `<body>` shared by every open dialog, counted rather
 * than saved and restored by each.
 *
 * Dialogs stack: the contact reveal opens over the gallery's animal
 * overlay. When both close at once (the browser's back with the reveal
 * open), React runs the outer dialog's cleanup before the inner one's, so a
 * dialog that restored "whatever overflow was there when I opened" would
 * put back the outer dialog's `hidden` after the outer one had already
 * released it, and leave the page unscrollable with no dialog on screen.
 * Counting makes the order irrelevant: the page scrolls again when the last
 * holder lets go.
 */
let holders = 0;
let overflowBeforeFirstLock = "";

/** Locks the page's scroll; the returned function releases this hold, once. */
export function lockBodyScroll(): () => void {
  if (holders === 0) {
    overflowBeforeFirstLock = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  holders += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders -= 1;
    if (holders === 0) document.body.style.overflow = overflowBeforeFirstLock;
  };
}
