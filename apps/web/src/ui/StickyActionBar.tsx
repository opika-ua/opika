"use client";

import { type ComponentProps, type ReactNode, useEffect, useRef, useState } from "react";
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
   * `surface` (default): a bordered card with a stacked layout. `ink`: the kabinet's page save bar,
   * a dark 16px-radius strip with the message left and the buttons right (`BarButton`s), which on a
   * phone sticks above the bottom nav (`bottom-above-nav`) instead of at the screen edge.
   */
  tone?: "surface" | "ink";
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
        tone === "ink"
          ? "bottom-above-nav pt-2 desktop:bottom-0 desktop:pb-inset"
          : "bottom-0 pt-2 pb-inset",
        className,
      )}
    >
      {tone === "ink" ? (
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-bar bg-ink py-2.5 pr-2.5 pl-6 text-on-ink shadow-float">
          {children}
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-card border-2 border-line bg-surface p-3 shadow-float tablet:p-4">
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * A button for the ink bar: `text` is white text on the bar («Скасувати»), `pill` a white pill with
 * ink text («Зберегти»). 44px drawn, 48px to the pointer (a `before:` overhang, as the choice chips).
 */
export function BarButton({
  kind,
  children,
  ...props
}: { kind: "text" | "pill"; children: ReactNode } & Omit<
  ComponentProps<"button">,
  "className" | "children"
>) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        "relative inline-flex h-11 cursor-pointer items-center justify-center whitespace-nowrap rounded-pill text-label focus-ring-on-ink before:absolute before:inset-x-0 before:-inset-y-0.5",
        kind === "pill" ? "bg-on-ink px-6 text-ink" : "px-4 text-on-ink",
      )}
    >
      {children}
    </button>
  );
}
