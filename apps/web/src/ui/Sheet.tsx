"use client";

import { type MouseEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { cx } from "./cx";
import { useDialogCore } from "./dialog-core";
import { Icon } from "./Icon";

/**
 * A bottom sheet with its own trigger (mobile filters, the nav menu). The trigger is a plain
 * `<a href="#id">` and the dialog is server-rendered closed; with no JS the `:target` rule in
 * globals.css (`dialog[data-hash-open]`) reveals it, and the close link is `href="#"`. With JS the
 * same markup upgrades to `showModal()` through the shared core (`dialog-core.ts`).
 *
 * What the existing sheets need to migrate: FilterSheet keeps its `<form method="GET">` as
 * `children` (the form submit navigates, which unmounts the sheet; a Sheet needs a
 * `closeOnSubmit` only if that stops being true); MobileNavMenu passes its
 * nav as `children` and its trigger styling through `triggerClassName`/`triggerLabel`.
 */
export type SheetProps = {
  /** The dialog id and the hash the trigger links to. */
  id: string;
  /** The accessible name of the sheet, and of the trigger unless `triggerLabel` says otherwise. */
  label: string;
  /** The trigger's own accessible name, when it carries more than the sheet's (a count of active filters). */
  triggerLabel?: string;
  /** Fires once the dialog has closed however it closed (✕, Esc, backdrop, Back), e.g. to drop unsaved edits. */
  onClosed?: () => void;
  closeLabel: string;
  /** What the trigger shows (usually an Icon and/or text). */
  trigger: ReactNode;
  /** Layout classes for the trigger (width, margin, visibility per breakpoint). */
  triggerClassName?: string;
  /**
   * Breakpoint from which the sheet (and the :target reveal) is off. Set it together with the
   * trigger's own hiding class: the hash reveal would otherwise show the sheet on a wide screen.
   */
  hideFrom?: keyof typeof HIDE_FROM;
  /** Test hooks for the harness; the unit tests query by role. */
  triggerTestId?: string;
  dialogTestId?: string;
  /**
   * `bottom` (default): a bottom sheet with its own title bar. `screen`: full-screen below `tablet`
   * and a centred dialog (up to 560px) from it, with no title bar: `children` is a function that
   * draws its own header and gets the close control to place in it, and fills the dialog's height
   * (a sticky footer stays put while the body scrolls).
   */
  presentation?: "bottom" | "screen";
  children: ReactNode | ((slots: { close: ReactNode }) => ReactNode);
};

const HIDE_FROM = { tablet: "tablet:hidden", desktop: "desktop:hidden" } as const;

export function Sheet({
  id,
  label,
  triggerLabel,
  onClosed,
  closeLabel,
  trigger,
  triggerClassName,
  hideFrom,
  triggerTestId,
  dialogTestId,
  presentation = "bottom",
  children,
}: SheetProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLAnchorElement | null>(null);
  const { ref, onBackdropClick } = useDialogCore({
    open,
    onClose: () => {
      setOpen(false);
      onClosed?.();
      // Clear the fragment left by the no-JS path so a reload does not re-show the sheet.
      if (window.location.hash === `#${id}`) {
        history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    },
  });

  // Returning focus to the opener is native for showModal(), but not when the dialog was opened by :target.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const refocus = () => triggerRef.current?.focus();
    dialog.addEventListener("close", refocus);
    return () => dialog.removeEventListener("close", refocus);
  }, [ref]);

  const openWithJs = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    setOpen(true);
  };
  const closeWithJs = (event: MouseEvent<HTMLAnchorElement>) => {
    // Without `open` (the :target reveal) fall through to href="#", which clears the fragment.
    if (!ref.current?.open) return;
    event.preventDefault();
    ref.current.close();
  };

  const closeLink = (
    // biome-ignore lint/a11y/useValidAnchor: real navigation; without JS this is the only way to clear the :target fragment and hide the sheet.
    <a
      href="#"
      onClick={closeWithJs}
      aria-label={closeLabel}
      className="inline-flex size-target shrink-0 cursor-pointer items-center justify-center rounded-pill text-ink focus-ring"
    >
      <Icon name="close" />
    </a>
  );

  return (
    <>
      <a
        ref={triggerRef}
        href={`#${id}`}
        onClick={openWithJs}
        aria-label={triggerLabel ?? label}
        aria-haspopup="dialog"
        aria-controls={id}
        aria-expanded={open}
        data-testid={triggerTestId}
        className={cx(
          "inline-flex min-h-target min-w-target cursor-pointer items-center justify-center gap-2 text-label text-ink focus-ring",
          triggerClassName,
        )}
      >
        {trigger}
      </a>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Esc is native on a modal <dialog>; the click only handles the backdrop. */}
      <dialog
        ref={ref}
        id={id}
        data-hash-open=""
        data-hide-from={hideFrom}
        data-testid={dialogTestId}
        aria-label={label}
        onClick={onBackdropClick}
        className={cx(
          presentation === "screen"
            ? "fixed inset-0 z-(--z-sheet) m-0 h-dvh max-h-dvh w-full max-w-none overflow-hidden rounded-none border-0 bg-surface p-0 text-ink backdrop:bg-ink/40 tablet:inset-auto tablet:m-auto tablet:h-auto tablet:max-h-dvh tablet:max-w-140 tablet:rounded-panel"
            : "fixed inset-x-0 bottom-0 top-auto z-(--z-sheet) m-0 max-h-dvh w-full max-w-none overflow-y-auto rounded-t-panel border-0 bg-surface p-0 text-ink backdrop:bg-ink/40 tablet:rounded-t-sheet",
          hideFrom && HIDE_FROM[hideFrom],
        )}
      >
        {presentation === "screen" ? (
          <div className="flex h-dvh max-h-dvh flex-col tablet:h-175 tablet:max-h-dvh">
            {typeof children === "function" ? children({ close: closeLink }) : children}
          </div>
        ) : (
          <div className="flex flex-col gap-4 p-5 pb-safe">
            <div className="flex items-center justify-between gap-4">
              <span className="text-label text-ink-2">{label}</span>
              {closeLink}
            </div>
            {typeof children === "function" ? children({ close: closeLink }) : children}
          </div>
        )}
      </dialog>
    </>
  );
}
