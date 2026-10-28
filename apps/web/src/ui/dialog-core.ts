"use client";

import { type MouseEvent, type RefObject, useEffect, useLayoutEffect, useRef } from "react";
import { lockBodyScroll } from "./body-scroll-lock";

/**
 * The shared core under Modal and Sheet. A native `<dialog>` opened with `showModal()` gives, with no
 * code of ours: a focus trap (everything else is inert), Esc to close, the Android Back key (browsers
 * route it to a modal dialog's close request), a top layer above any z-index, and focus returned to
 * the opener on close. This hook adds what the platform does not:
 * - the page behind does not scroll (counted lock, shared with other overlays);
 * - initial focus goes to a named element (the title), not the first control;
 * - a click on the backdrop closes it;
 * - `onClose` fires once however it closed (Esc, Back, backdrop, button, `form method=dialog`).
 * Size, `dvh` and safe-area insets are the components' classes, so one rule serves both.
 */
export function useDialogCore({
  open,
  onClose,
  initialFocusRef,
}: {
  open: boolean;
  onClose: () => void;
  initialFocusRef?: RefObject<HTMLElement | null>;
}) {
  const ref = useRef<HTMLDialogElement | null>(null);
  // The latest handler, read by the one `close` listener: no re-subscribing per render.
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const fire = () => onCloseRef.current();
    dialog.addEventListener("close", fire);
    return () => dialog.removeEventListener("close", fire);
  }, []);

  // A layout effect: the lock is on in the commit that shows the dialog, not a frame later.
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    if (!dialog.open) dialog.showModal();
    const release = lockBodyScroll();
    initialFocusRef?.current?.focus();
    return () => {
      release();
      if (dialog.open) dialog.close();
    };
  }, [open, initialFocusRef]);

  const onBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    // The dialog element itself is the backdrop's click target; its content never is.
    if (event.target === event.currentTarget) event.currentTarget.close();
  };

  return { ref, onBackdropClick };
}
