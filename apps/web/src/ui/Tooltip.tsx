"use client";

import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAnchored } from "./anchored";
import { cx } from "./cx";

/**
 * A one-line name for an icon-only control, shown on mouse hover and on keyboard focus. It repeats
 * the control's own accessible name, so it is not linked to it (no double reading) and never holds
 * anything the control does not already say. The bubble is a manual popover in the top layer, so no
 * container clips it and opening moves nothing; it follows the control on scroll and goes with Esc,
 * a press, or the control leaving the view. Touch never opens it (a tap would only cover the card).
 */
export type TooltipProps = {
  text: string;
  /** The control. Give it the same `text` as its accessible name. */
  children: ReactNode;
  /** Layout only: where the wrapper sits (for example `absolute top-2 right-2`). */
  className?: string;
};

const EDGE = 8;
const GAP = 6;

type Box = { top: number; left: number };

// A mouse press focuses the control too, but only keyboard focus should open the bubble.
function isKeyboardFocus(target: EventTarget): boolean {
  try {
    return (target as Element).matches(":focus-visible");
  } catch {
    return true;
  }
}

export function Tooltip({ text, children, className }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<Box | null>(null);
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel) return;
    if (typeof panel.showPopover === "function" && !panel.matches(":popover-open")) {
      panel.showPopover();
    }
  }, [open]);

  useEffect(() => {
    if (!open) setBox(null);
  }, [open]);

  useAnchored(
    open,
    anchorRef,
    (anchor) => {
      const rect = anchor.getBoundingClientRect();
      const viewport = document.documentElement.clientWidth;
      const width = panelRef.current?.offsetWidth ?? 0;
      // Lined up with the control's right edge: it sits in a card's corner, so left-aligned would overflow.
      const left = Math.max(EDGE, Math.min(rect.right - width, viewport - EDGE - width));
      setBox({ top: rect.bottom + GAP, left });
    },
    () => setOpen(false),
  );

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover and focus bubble from the control inside; this only shows the bubble.
    <span
      ref={anchorRef}
      className={cx("inline-flex", className)}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") setOpen(true);
      }}
      onPointerLeave={() => setOpen(false)}
      onPointerDown={() => setOpen(false)}
      onFocus={(event) => setOpen(isKeyboardFocus(event.target))}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open
        ? createPortal(
            <div
              ref={panelRef}
              popover="manual"
              role="tooltip"
              style={
                box ? { top: box.top, left: box.left } : { top: 0, left: 0, visibility: "hidden" }
              }
              className="pointer-events-none fixed inset-auto m-0 w-max max-w-64 rounded-field bg-ink px-3 py-2 text-caption font-semibold text-on-ink shadow-float"
            >
              {text}
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
