"use client";

import { type ReactNode, useId, useRef } from "react";
import { Button } from "./controls";
import { useModalFocus } from "./useModalFocus";

/**
 * N15's dialog frame, shared (r-ui-plan §6: "the reason dialog is shared by
 * K4's pause, PR 5's withdraw reason and R-UI 3; whichever lands first
 * extracts it"). The frame only: what goes inside, and what the primary
 * action does, stays with each dialog.
 *
 * Modal over the page; on the phone a bottom sheet, from tablet up a centred
 * card. Focus moves to the title on open; Tab and Shift+Tab cycle inside
 * while it is open; Escape and ✕ both close it (the reveal dialog's own
 * pattern, `ContactRevealDialog`). The page behind doesn't scroll while it is
 * open (`useModalFocus`, shared with the gallery's animal overlay). The title
 * is its accessible name, the body its description. Giving focus back to
 * whatever opened it is the caller's: only the caller knows whether that
 * control still exists after the action.
 *
 * Styled only through the shared tokens, like the controls beside it.
 */

const BACKDROP =
  "fixed inset-0 z-50 flex items-end justify-center bg-rg-fill-strong/90 tablet:items-center tablet:p-8";
const FRAME =
  "flex max-h-dvh w-full flex-col gap-5 overflow-y-auto rounded-t-rg-card bg-rg-surface p-5 shadow-rg-card tablet:max-w-xl tablet:rounded-rg-card tablet:p-8";
const TITLE = "text-2xl font-bold tracking-tight text-rg-ink";
const BODY = "text-base text-rg-ink";

export function ModalDialog({
  title,
  body,
  closeLabel,
  onClose,
  children,
}: {
  title: string;
  body: string;
  /** The ✕ button's accessible name. */
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const id = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  useModalFocus({ dialogRef, initialFocusRef: titleRef, onClose });

  return (
    <div className={BACKDROP}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-body`}
        className={FRAME}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={`${id}-title`} ref={titleRef} tabIndex={-1} className={TITLE}>
            {title}
          </h2>
          <Button variant="icon" aria-label={closeLabel} onClick={onClose}>
            <span aria-hidden="true">✕</span>
          </Button>
        </div>
        <p id={`${id}-body`} className={BODY}>
          {body}
        </p>
        {children}
      </div>
    </div>
  );
}
