"use client";

import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAnchored } from "./anchored";
import { buttonClass } from "./Button";
import { cx } from "./cx";
import { Icon } from "./Icon";

/**
 * A short list of actions under a button (a row's «Ще»). A disclosure, not an ARIA menu: the
 * trigger carries `aria-expanded`/`aria-controls`, the items are ordinary buttons and links in
 * tab order, so nothing needs arrow keys. Controlled, because the page often needs to know which
 * menu is open (one at a time) and to focus the trigger when something it opened closes.
 * Light dismiss as Popover: Esc (focus returns to the trigger), a press outside, focus leaving.
 * The panel sits in the top layer (a manual popover), so no container clips it; it follows the
 * trigger on scroll and closes when the trigger scrolls out of view (`useAnchored`).
 */
export type MenuProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The trigger's visible text (a chevron is added), or, with `trigger="icon"`, its accessible name. */
  label: string;
  /** `text` (default): the label and a chevron. `icon`: a ⋯ button, 48px square, named by `label`. */
  trigger?: "text" | "icon";
  /** Id of the trigger, so the page can return focus to it. */
  triggerId?: string;
  /** Ids that give the trigger its context (a screen reader hears whose «Ще» it is). */
  describedBy?: string;
  /** Which edge of the trigger the panel lines up with. */
  align?: "start" | "end";
  /** Layout only. */
  className?: string;
  /** `MenuItem`s. */
  children: ReactNode;
};

const EDGE = 8;
const GAP = 4;

type Box = { top: number; left?: number; right?: number; minWidth: number };

function place(trigger: HTMLElement, panel: HTMLElement | null, align: "start" | "end"): Box {
  const rect = trigger.getBoundingClientRect();
  const viewport = document.documentElement.clientWidth;
  const height = panel?.offsetHeight ?? 0;
  const below = rect.bottom + GAP;
  const above = height > window.innerHeight - below - EDGE && rect.top > window.innerHeight - below;
  const top = above ? Math.max(EDGE, rect.top - GAP - height) : below;
  const minWidth = 192;
  if (align === "start") {
    return { top, left: Math.max(EDGE, Math.min(rect.left, viewport - EDGE - minWidth)), minWidth };
  }
  return { top, right: Math.max(EDGE, viewport - rect.right), minWidth };
}

export function Menu({
  open,
  onOpenChange,
  label,
  trigger = "text",
  triggerId,
  describedBy,
  align = "end",
  className,
  children,
}: MenuProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLUListElement | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const panelId = useId();
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  });

  const inside = (node: Node) =>
    rootRef.current?.contains(node) === true || panelRef.current?.contains(node) === true;

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
    buttonRef,
    (trigger) => setBox(place(trigger, panelRef.current, align)),
    () => {
      const focusInside = panelRef.current?.contains(document.activeElement) === true;
      onOpenChangeRef.current(false);
      if (focusInside) buttonRef.current?.focus({ preventScroll: true });
    },
  );

  useEffect(() => {
    if (!open) return;
    const close = () => onOpenChangeRef.current(false);
    const onPointerDown = (event: PointerEvent) => {
      if (!inside(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      close();
      buttonRef.current?.focus();
    };
    const onFocusIn = (event: FocusEvent) => {
      if (!inside(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cx("relative", className)}>
      <button
        ref={buttonRef}
        id={triggerId}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-describedby={describedBy}
        onClick={() => onOpenChange(!open)}
        aria-label={trigger === "icon" ? label : undefined}
        className={trigger === "icon" ? buttonClass("icon") : buttonClass("ghost")}
      >
        {trigger === "icon" ? (
          <Icon name="more" size="md" />
        ) : (
          <>
            {label}
            <Icon
              name="chevron-down"
              size="md"
              className={cx(
                "transition-transform duration-(--duration-quick)",
                open && "rotate-180",
              )}
            />
          </>
        )}
      </button>
      {open
        ? createPortal(
            <ul
              ref={panelRef}
              id={panelId}
              popover="manual"
              style={
                box
                  ? { top: box.top, left: box.left, right: box.right, minWidth: box.minWidth }
                  : { top: 0, left: 0, visibility: "hidden" }
              }
              className="fixed inset-auto m-0 flex w-max max-w-xs flex-col gap-1 overflow-visible rounded-panel border-2 border-line bg-surface p-2 text-ink shadow-float"
            >
              {children}
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}

/**
 * One entry of a Menu: put a ghost Button or LinkButton inside with `className="w-full justify-start"`.
 * `tone="danger"` colours it with the danger token (the one destructive entry, after a divider).
 */
export function MenuItem({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "danger";
}) {
  return <li className={tone === "danger" ? "[&>*]:text-danger" : undefined}>{children}</li>;
}

/** A thin rule between groups of entries (the safe moves, then the destructive one). */
export function MenuDivider() {
  return <li aria-hidden="true" className="my-1 h-0.5 bg-line" />;
}
