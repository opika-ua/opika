"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { chipClass } from "./Chip";
import { cx } from "./cx";
import { Icon } from "./Icon";

/**
 * A small panel anchored under its trigger (the filter selectors). The trigger is a chip-styled
 * button; `active` marks that a choice is already made. Light dismiss: Esc (focus returns to the
 * trigger), a click or tap outside, or focus leaving the panel with Tab. Not a modal: the page
 * behind stays usable, so there is no scroll lock and no focus trap.
 *
 * `children` is the panel's content - typically links or checkboxes, so choosing works without JS
 * once the panel is open, and the panel itself is the only part that needs JS to open.
 */
export type PopoverProps = {
  /** What the trigger shows. For an accessible name that includes the group, pass `label`. */
  trigger: ReactNode;
  /** Accessible name of the trigger and the panel (e.g. «Місто: Київ»). */
  label: string;
  active?: boolean;
  /** Which edge of the trigger the panel lines up with. */
  align?: "start" | "end";
  /** Layout only: width of the whole control. */
  className?: string;
  children: ReactNode;
};

export function Popover({
  trigger,
  label,
  active = false,
  align = "start",
  className,
  children,
}: PopoverProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();

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

  return (
    <div ref={rootRef} className={cx("relative", className)}>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={label}
        onClick={() => setOpen((value) => !value)}
        className={cx(chipClass(active), "w-full justify-between gap-3 focus-ring")}
      >
        <span className="truncate">{trigger}</span>
        <Icon
          name="chevron-down"
          size="md"
          className={cx("transition-transform duration-(--duration-quick)", open && "rotate-180")}
        />
      </button>
      {open ? (
        <fieldset
          id={panelId}
          className={cx(
            "absolute top-full z-(--z-popover) mt-2 flex min-w-full flex-col gap-1 rounded-panel border-2 border-line bg-surface p-2 shadow-float",
            align === "start" ? "left-0" : "right-0",
          )}
        >
          <legend className="sr-only">{label}</legend>
          {children}
        </fieldset>
      ) : null}
    </div>
  );
}
