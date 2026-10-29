"use client";

import { type RefObject, useEffect, useLayoutEffect, useRef } from "react";
import { lockBodyScroll } from "./body-scroll-lock";

/**
 * What Tab can land on. A natively disabled control can't take focus, so it
 * is left out: a trap that counted one as its first or last stop would let
 * focus escape past it. A control that is only `aria-disabled` stays in, as
 * the design system wants (KABINET, buttons: "stays focusable").
 */
const FOCUSABLE =
  'button:not([disabled]), select:not([disabled]), textarea:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/**
 * The modal behaviour shared by the reveal dialog and the gallery's animal
 * overlay (designer round 1, DR1-D6: one trap, not one per dialog): focus to
 * the title on open, Tab and Shift+Tab cycle inside the dialog, Escape calls
 * `onClose`, and the page behind doesn't scroll while it is open.
 *
 * The scroll lock is a layout effect, not a passive one (RF-F1,
 * `docs/decisions-inbox/fix-rf-f1-reveal-scroll-lock.md`). The overlay mounts
 * when a server navigation resolves, not inside the click that asked for
 * it, and React defers a passive effect from such an update to after the
 * next paint: one frame where the dialog is visible and the page behind it
 * still scrolls. A layout effect locks it in the commit that inserts the
 * dialog.
 *
 * A key a dialog stacked above this one already handled (`defaultPrevented`)
 * is left alone: the contact reveal opens over the gallery's animal
 * overlay, and its Escape, caught in the capture phase, must close the
 * reveal only, not the overlay under it as well.
 *
 * Giving focus back to whatever opened the dialog stays with the caller:
 * only the caller knows whether that control still exists afterwards.
 */
export function useModalFocus({
  dialogRef,
  initialFocusRef,
  onClose,
}: {
  dialogRef: RefObject<HTMLElement | null>;
  initialFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  // The latest `onClose`, read by the one key listener: re-subscribing on
  // every render (a new arrow each time) would be listener churn.
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    initialFocusRef.current?.focus();
  }, [initialFocusRef]);

  useLayoutEffect(() => {
    const releaseScroll = lockBodyScroll();
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      // Indexed against the list rather than compared to first/last: focus
      // starts on the title, which carries tabindex="-1" and so is in
      // neither position, and Shift+Tab from it would otherwise leak to the
      // page behind (the reveal dialog's own finding).
      const active = document.activeElement;
      const index =
        active instanceof HTMLElement ? Array.prototype.indexOf.call(focusable, active) : -1;
      if (event.shiftKey ? index <= 0 : index === -1 || index === focusable.length - 1) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      releaseScroll();
    };
  }, [dialogRef]);
}
