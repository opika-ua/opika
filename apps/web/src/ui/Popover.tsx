"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAnchored } from "./anchored";
import { chipClass } from "./Chip";
import { cx } from "./cx";
import { Icon } from "./Icon";

/**
 * A small panel anchored under its trigger (the filter selectors). Opening moves focus to the
 * panel's first usable control. Light dismiss: Esc and the trigger (focus returns to the trigger),
 * a click or tap outside, or focus leaving the panel with Tab. Not a modal: the page behind stays
 * usable, so there is no scroll lock and no focus trap. The panel sits in the top layer (a manual
 * popover), so no overflow container clips it; it follows the trigger on scroll and closes when the
 * trigger scrolls out of view (`useAnchored`), like Menu.
 *
 * `children` is the panel's content - links, checkboxes or choice chips.
 */
export type PopoverProps = {
  /** What the trigger shows. For an accessible name that includes the group, pass `label`. */
  trigger: ReactNode;
  /** Accessible name of the trigger (e.g. «Місто: Київ»). */
  label: string;
  /** Name of the panel's group; defaults to `label`. */
  panelLabel?: string;
  active?: boolean;
  /** `chip`: a pill, ink when active. `field`: a 52px field, accent border when active. */
  variant?: "chip" | "field";
  /** `list`: a column of rows. `pills`: wrapping choice chips, up to 410px wide. */
  panel?: "list" | "pills";
  /** Which edge of the trigger the panel lines up with; it flips to `end` if `start` overflows. */
  align?: "start" | "end";
  /** When `active`, a ✕ link in place of the chevron that clears the whole selection. */
  clear?: { href: string; label: string };
  /** Layout only: width of the whole control. */
  className?: string;
  children: ReactNode;
};

const TRIGGER = {
  chip: (active: boolean, _open: boolean) => cx(chipClass(active), "w-full justify-between gap-3"),
  field: (active: boolean, open: boolean) =>
    cx(
      "flex h-13 w-full min-w-0 cursor-pointer items-center justify-between gap-3 rounded-field border-2 bg-surface px-5 text-label text-ink",
      active || open ? "border-accent" : "border-line",
    ),
} as const;

const PANEL = {
  list: "flex-col gap-1 border-2 border-line p-2",
  // A 1px line the design (drawn over a dark backdrop) doesn't need, but this light page does.
  pills: "max-w-102.5 flex-wrap gap-3 border border-line p-5",
} as const;

const GAP = { list: 8, pills: 16 } as const;
const EDGE = 8;

type Box = { top: number; left: number; minWidth: number };

// Fixed coordinates under the trigger; `start` flips to the far edge when it would pass the viewport.
function place(
  trigger: HTMLElement,
  panel: HTMLElement | null,
  align: "start" | "end",
  gap: number,
): Box {
  const rect = trigger.getBoundingClientRect();
  const viewport = document.documentElement.clientWidth;
  const width = Math.max(panel?.offsetWidth ?? 0, rect.width);
  const flip = align === "end" || rect.left + width > viewport;
  const left = flip ? rect.right - width : rect.left;
  return {
    top: rect.bottom + gap,
    left: Math.max(EDGE, Math.min(left, viewport - EDGE - width)),
    minWidth: rect.width,
  };
}

/** A control in the panel that can take focus and isn't marked unusable. */
const USABLE =
  'button:not([disabled]):not([aria-disabled="true"]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Popover({
  trigger,
  label,
  panelLabel = label,
  active = false,
  variant = "chip",
  panel = "list",
  align = "start",
  clear,
  className,
  children,
}: PopoverProps) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<Box | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLFieldSetElement | null>(null);
  const panelId = useId();
  const showClear = active && clear !== undefined;

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
    (trigger) => setBox(place(trigger, panelRef.current, align, GAP[panel])),
    () => {
      const focusInside = panelRef.current?.contains(document.activeElement) === true;
      setOpen(false);
      if (focusInside) buttonRef.current?.focus({ preventScroll: true });
    },
  );

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!inside(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    const onFocusIn = (event: FocusEvent) => {
      if (!inside(event.target as Node)) setOpen(false);
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

  useEffect(() => {
    if (!open) return;
    const content = panelRef.current;
    const first = content?.querySelector<HTMLElement>(USABLE) ?? content?.querySelector("button");
    first?.focus({ preventScroll: true });
  }, [open]);

  return (
    <div ref={rootRef} className={cx("relative", className)}>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={label}
        onClick={() => setOpen((value) => !value)}
        className={cx(TRIGGER[variant](active, open), "focus-ring")}
      >
        <span className="truncate">{trigger}</span>
        {/* The slot stays when the ✕ covers it, so the label's width doesn't shift. */}
        <span className="size-5 shrink-0" aria-hidden="true">
          {showClear ? null : (
            <Icon
              name="chevron-down"
              size="md"
              className={cx(
                "transition-transform duration-(--duration-quick)",
                open && "rotate-180",
              )}
            />
          )}
        </span>
      </button>
      {showClear ? (
        // A sibling, not inside the trigger: interactive elements cannot nest.
        <Link
          prefetch={false}
          href={clear.href}
          aria-label={clear.label}
          onClick={() => setOpen(false)}
          className="absolute top-1/2 right-1.5 flex size-target -translate-y-1/2 cursor-pointer items-center justify-center text-ink focus-ring"
        >
          <Icon name="close" size="md" />
        </Link>
      ) : null}
      {open
        ? createPortal(
            <fieldset
              ref={panelRef}
              id={panelId}
              popover="manual"
              style={
                box
                  ? { top: box.top, left: box.left, minWidth: box.minWidth }
                  : { top: 0, left: 0, visibility: "hidden" }
              }
              className={cx(
                "fixed inset-auto m-0 flex w-max overflow-visible rounded-panel bg-surface text-ink shadow-float",
                PANEL[panel],
              )}
            >
              <legend className="sr-only">{panelLabel}</legend>
              {children}
            </fieldset>,
            document.body,
          )
        : null}
    </div>
  );
}
