"use client";

import { type ReactNode, useEffect, useId, useRef } from "react";
import { buttonClass } from "./Button";
import { cx } from "./cx";
import { Icon } from "./Icon";

/**
 * A short list of actions under a button (a row's «Ще»). A disclosure, not an ARIA menu: the
 * trigger carries `aria-expanded`/`aria-controls`, the items are ordinary buttons and links in
 * tab order, so nothing needs arrow keys. Controlled, because the page often needs to know which
 * menu is open (one at a time) and to focus the trigger when something it opened closes.
 * Light dismiss as Popover: Esc (focus returns to the trigger), a press outside, focus leaving.
 */
export type MenuProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The trigger's visible text; a chevron is added. */
  label: string;
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

export function Menu({
  open,
  onOpenChange,
  label,
  triggerId,
  describedBy,
  align = "end",
  className,
  children,
}: MenuProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  });

  useEffect(() => {
    if (!open) return;
    const close = () => onOpenChangeRef.current(false);
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      close();
      buttonRef.current?.focus();
    };
    const onFocusIn = (event: FocusEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
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
        className={buttonClass("ghost")}
      >
        {label}
        <Icon
          name="chevron-down"
          size="md"
          className={cx("transition-transform duration-(--duration-quick)", open && "rotate-180")}
        />
      </button>
      {open ? (
        <ul
          id={panelId}
          className={cx(
            "absolute top-full z-(--z-popover) mt-2 flex w-max max-w-xs min-w-48 flex-col gap-1 rounded-panel border-2 border-line bg-surface p-2 shadow-float",
            align === "start" ? "left-0" : "right-0",
          )}
        >
          {children}
        </ul>
      ) : null}
    </div>
  );
}

/** One entry of a Menu: put a ghost Button or LinkButton inside with `className="w-full justify-start"`. */
export function MenuItem({ children }: { children: ReactNode }) {
  return <li>{children}</li>;
}
