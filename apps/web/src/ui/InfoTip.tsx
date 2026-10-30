"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { cx } from "./cx";
import { Icon } from "./Icon";

/**
 * A «?» button that opens a short explanation in a small card under it (above when there is no room).
 * The card sits in the top layer, so opening never moves the content around it and no container
 * clips it. Closes on ✕, Esc, a press outside, focus leaving, or the «?» again; focus returns to the
 * «?». Opening moves focus to the ✕ so the keyboard reaches it. Only one is open at a time.
 * `label` is the button's accessible name (the glyph is decorative).
 */
export type InfoTipProps = {
  label: string;
  /** Text for the ✕ button. */
  closeLabel: string;
  children: ReactNode;
  /** Layout only. */
  className?: string;
};

const EDGE = 16;
const GAP = 4;
const ARROW = 12;
const WIDE_MAX = 280;
const PHONE_MAX = 300;
// The tablet breakpoint (600px, globals.css): below it the card may be 300px wide.
const PHONE_BELOW = 600;
const OPEN_EVENT = "opika:infotip-open";

type Box = { top: number; left: number; width: number; arrowLeft: number; above: boolean };

function place(trigger: HTMLElement, panel: HTMLElement | null): Box {
  const rect = trigger.getBoundingClientRect();
  const viewport = document.documentElement.clientWidth;
  const width = Math.min(viewport < PHONE_BELOW ? PHONE_MAX : WIDE_MAX, viewport - 2 * EDGE);
  const left = Math.max(EDGE, Math.min(rect.left, viewport - EDGE - width));
  const height = panel?.offsetHeight ?? 0;
  const below = rect.bottom - GAP;
  const spaceBelow = window.innerHeight - below;
  const spaceAbove = rect.top + GAP;
  const above = height > spaceBelow - EDGE && spaceAbove > spaceBelow;
  const center = rect.left + rect.width / 2;
  const arrowLeft = Math.max(ARROW, Math.min(center - left, width - ARROW)) - ARROW / 2;
  return { top: above ? rect.top + GAP - height : below, left, width, arrowLeft, above };
}

export function InfoTip({ label, closeLabel, children, className }: InfoTipProps) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<Box | null>(null);
  const id = useId();
  const panelId = `${id}-panel`;
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }, []);

  // Top layer: a manual popover is never clipped by a container and sits above any z-index.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel) return;
    if (typeof panel.showPopover === "function" && !panel.matches(":popover-open")) {
      panel.showPopover();
    }
  }, [open]);

  // Before paint, and again when the page scrolls or resizes under an open card.
  useLayoutEffect(() => {
    const trigger = buttonRef.current;
    if (!open || !trigger) {
      setBox(null);
      return;
    }
    const update = () => setBox(place(trigger, panelRef.current));
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const inside = (node: Node) =>
      buttonRef.current?.contains(node) === true || panelRef.current?.contains(node) === true;
    const onPointerDown = (event: PointerEvent) => {
      if (!inside(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(true);
    };
    const onFocusIn = (event: FocusEvent) => {
      if (!inside(event.target as Node)) setOpen(false);
    };
    const onOther = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== id) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);
    window.addEventListener(OPEN_EVENT, onOther);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
      window.removeEventListener(OPEN_EVENT, onOther);
    };
  }, [open, close, id]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: id }));
    setOpen(true);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={toggle}
        className={cx(
          "inline-flex size-target shrink-0 items-center justify-center rounded-pill text-label focus-ring",
          className,
        )}
      >
        <span
          aria-hidden="true"
          className={cx(
            "inline-flex size-7 items-center justify-center rounded-pill border-2",
            open ? "border-ink bg-ink text-surface" : "border-line text-ink",
          )}
        >
          ?
        </span>
      </button>
      {open
        ? createPortal(
            <div
              ref={panelRef}
              id={panelId}
              popover="manual"
              role="note"
              aria-label={label}
              style={
                box
                  ? { top: box.top, left: box.left, width: box.width }
                  : { top: 0, left: 0, visibility: "hidden" }
              }
              className="fixed inset-auto m-0 overflow-visible rounded-field border-2 border-line bg-surface py-3 pr-10 pl-3 text-caption font-normal text-ink shadow-float"
            >
              <span
                aria-hidden="true"
                style={box ? { left: box.arrowLeft } : undefined}
                className={cx(
                  "absolute size-3 rotate-45 border-line bg-surface",
                  box?.above ? "-bottom-2 border-r-2 border-b-2" : "-top-2 border-t-2 border-l-2",
                )}
              />
              <button
                ref={closeRef}
                type="button"
                aria-label={closeLabel}
                onClick={() => close(true)}
                className="absolute top-0 right-0 inline-flex size-11 items-center justify-center rounded-pill text-ink focus-ring"
              >
                <Icon name="close" size="sm" />
              </button>
              {children}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
