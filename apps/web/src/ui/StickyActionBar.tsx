"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { cx } from "./cx";
import { keyboardInsetOf, revealAboveBar } from "./sticky-bar";

/**
 * The save / publish bar of a long form: it sticks to the bottom edge of the screen while the form
 * scrolls, and ends in the flow after the last section. Inset from the page gutters as a card,
 * 8px or the home-indicator inset above the bottom edge (`pb-inset`).
 *
 * On a phone with the keyboard open, `position: sticky` and `fixed` are laid out against the
 * layout viewport, which the keyboard overlays, so the bar would sit behind the keys. The
 * VisualViewport API reports what is really visible; the bar is lifted by the difference, so its
 * buttons stay reachable. It also tells the page to scroll a focused field clear of the bar
 * (`scroll-padding-bottom`, plus a nudge on focus for the browsers that ignore it).
 * Without JS it is a plain sticky bar.
 */
export function StickyActionBar({
  children,
  className,
  tone = "surface",
}: {
  /** The bar's content: a status line and the buttons. */
  children: ReactNode;
  /** Layout only. */
  className?: string;
  /**
   * `surface` (default): a bordered card with a stacked layout. `float`: only the sticky placement
   * for the kabinet's save pill / bar (`SavePill` draws it): above the bottom nav on a phone, 16px
   * above the bottom edge from `desktop`, and full width of the column's right-aligned content.
   */
  tone?: "surface" | "float";
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (viewport === null || viewport === undefined) return;
    const update = () => {
      setInset(
        keyboardInsetOf({
          layoutHeight: document.documentElement.clientHeight,
          viewportHeight: viewport.height,
          viewportOffsetTop: viewport.offsetTop,
          scale: viewport.scale,
        }),
      );
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);

  useEffect(() => {
    const bar = ref.current;
    if (bar === null) return;
    const root = document.documentElement;
    const reveal = () => revealAboveBar(document.activeElement, bar.getBoundingClientRect().top);
    const sync = () => {
      root.style.scrollPaddingBottom = `${bar.offsetHeight + 16}px`;
    };
    sync();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => sync());
    observer?.observe(bar);
    // The keyboard takes a moment to open after focus; look again once the viewport has settled.
    const onFocusIn = () => {
      window.requestAnimationFrame(reveal);
      window.setTimeout(reveal, 300);
    };
    document.addEventListener("focusin", onFocusIn);
    return () => {
      observer?.disconnect();
      root.style.scrollPaddingBottom = "";
      document.removeEventListener("focusin", onFocusIn);
    };
  }, []);

  return (
    <div
      ref={ref}
      style={inset > 0 ? { transform: `translateY(-${inset}px)` } : undefined}
      className={cx(
        "sticky z-(--z-header)",
        tone === "float" ? "bottom-above-nav desktop:bottom-4" : "bottom-0 pt-2 pb-inset",
        className,
      )}
    >
      {tone === "float" ? (
        children
      ) : (
        <div className="flex flex-col gap-2 rounded-card border-2 border-line bg-surface p-3 shadow-float tablet:p-4">
          {children}
        </div>
      )}
    </div>
  );
}
