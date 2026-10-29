"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { chipClass } from "./Chip";
import { cx } from "./cx";
import { Icon } from "./Icon";

/**
 * A small panel anchored under its trigger (the filter selectors). Opening moves focus to the
 * panel's first usable control. Light dismiss: Esc and the trigger (focus returns to the trigger),
 * a click or tap outside, or focus leaving the panel with Tab. Not a modal: the page behind stays
 * usable, so there is no scroll lock and no focus trap.
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
  list: "mt-2 min-w-full flex-col gap-1 border-2 border-line p-2",
  // A 1px line the design (drawn over a dark backdrop) doesn't need, but this light page does.
  pills: "mt-4 w-max min-w-full max-w-102.5 flex-wrap gap-3 border border-line p-5",
} as const;

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
  const [flipped, setFlipped] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLFieldSetElement | null>(null);
  const panelId = useId();
  const showClear = active && clear !== undefined;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    const onFocusIn = (event: FocusEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
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

  // Before paint, so the panel never shows past the viewport's edge for a frame.
  useLayoutEffect(() => {
    if (!open) {
      setFlipped(false);
      return;
    }
    const box = panelRef.current?.getBoundingClientRect();
    if (align === "start" && box && box.right > document.documentElement.clientWidth) {
      setFlipped(true);
    }
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const content = panelRef.current;
    const first = content?.querySelector<HTMLElement>(USABLE) ?? content?.querySelector("button");
    first?.focus();
  }, [open]);

  const alignEnd = align === "end" || flipped;

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
      {open ? (
        <fieldset
          ref={panelRef}
          id={panelId}
          className={cx(
            "absolute top-full z-(--z-popover) flex rounded-panel bg-surface shadow-float",
            PANEL[panel],
            alignEnd ? "right-0" : "left-0",
          )}
        >
          <legend className="sr-only">{panelLabel}</legend>
          {children}
        </fieldset>
      ) : null}
    </div>
  );
}
