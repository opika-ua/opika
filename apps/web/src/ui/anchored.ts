import { useEffect, useLayoutEffect, useRef } from "react";

/** Reads `--sticky-header-h` (globals.css, set by the site header) as px; 0 when unset or unreadable. */
export function stickyHeaderHeight(): number {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--sticky-header-h")
    .trim();
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) return 0;
  if (raw.endsWith("rem")) {
    return value * Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  }
  return value;
}

/**
 * Keeps an open top-layer popover tied to its trigger: `place` runs before paint and on every scroll
 * and resize; `onHidden` runs once when the trigger leaves the visible area (under the sticky header
 * or off screen), where the caller must close exactly as Esc does. Shared by InfoTip and ComboboxMulti.
 */
export function useAnchored(
  open: boolean,
  anchorRef: { readonly current: HTMLElement | null },
  place: (anchor: HTMLElement) => void,
  onHidden: () => void,
): void {
  const placeRef = useRef(place);
  const hiddenRef = useRef(onHidden);
  placeRef.current = place;
  hiddenRef.current = onHidden;

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!open || !anchor) return;
    const update = () => placeRef.current(anchor);
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, anchorRef]);

  useEffect(() => {
    const anchor = anchorRef.current;
    if (!open || !anchor || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry && !entry.isIntersecting) hiddenRef.current();
      },
      { rootMargin: `${-stickyHeaderHeight()}px 0px 0px 0px`, threshold: 0 },
    );
    observer.observe(anchor);
    return () => observer.disconnect();
  }, [open, anchorRef]);
}
