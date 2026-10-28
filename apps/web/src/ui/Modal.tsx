"use client";

import { type ReactNode, useId, useRef } from "react";
import { cx } from "./cx";
import { useDialogCore } from "./dialog-core";
import { Icon } from "./Icon";

/**
 * A modal dialog: a bottom sheet on a phone, a centred card from tablet up. Controlled: render it
 * with `open`, and update your state in `onClose`. The title names it, the optional description is
 * its accessible description; the close button's name is yours (the kit holds no copy).
 *
 * Built on the same core as Sheet (`dialog-core.ts`). What each existing dialog needs to migrate:
 * ModalDialog (kabinet): nothing extra, same props. ContactRevealDialog: stacking over the animal
 * overlay works because both are in the top layer, last opened on top. AnimalOverlay: route-driven,
 * so pass `open` always and call `router.back()` in `onClose`.
 */
export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  closeLabel: string;
  children: ReactNode;
};

export function Modal({ open, onClose, title, description, closeLabel, children }: ModalProps) {
  const id = useId();
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const { ref, onBackdropClick } = useDialogCore({ open, onClose, initialFocusRef: titleRef });

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Esc is native on a modal <dialog>; the click only handles the backdrop.
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      aria-describedby={description === undefined ? undefined : `${id}-desc`}
      onClick={onBackdropClick}
      className={cx(
        "fixed inset-x-0 bottom-0 top-auto m-0 w-full max-w-none overflow-y-auto rounded-t-panel border-0 bg-surface p-0 text-ink backdrop:bg-ink/40",
        "max-h-dvh tablet:inset-0 tablet:m-auto tablet:h-fit tablet:max-w-xl tablet:rounded-card",
      )}
    >
      <div className="flex flex-col gap-5 p-5 pb-safe tablet:p-8">
        <div className="flex items-start justify-between gap-4">
          <h2 id={`${id}-title`} ref={titleRef} tabIndex={-1} className="text-title text-ink">
            {title}
          </h2>
          <button
            type="button"
            aria-label={closeLabel}
            onClick={() => ref.current?.close()}
            className="inline-flex size-target shrink-0 cursor-pointer items-center justify-center rounded-pill bg-page text-ink focus-ring"
          >
            <Icon name="close" />
          </button>
        </div>
        {description === undefined ? null : (
          <p id={`${id}-desc`} className="text-body text-ink">
            {description}
          </p>
        )}
        {children}
      </div>
    </dialog>
  );
}
