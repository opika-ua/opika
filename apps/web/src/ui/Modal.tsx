"use client";

import { type ReactNode, useId, useRef } from "react";
import { cx } from "./cx";
import { useDialogCore } from "./dialog-core";
import { Icon } from "./Icon";
import { MascotPerch } from "./Mascot";

/**
 * A modal dialog: a bottom sheet on a phone, a centred card from tablet up. Controlled: render it
 * with `open`, and update your state in `onClose`. The title names it, the optional description is
 * its accessible description; the close button's name is yours (the kit holds no copy).
 *
 * Built on the same core as Sheet (`dialog-core.ts`). `header` puts the dialog's lead (e.g. a
 * thumbnail and a name) in the close button's row, with the title below it; the close button stays
 * the only one. Stacking over the animal overlay works because both are in the top layer: the page
 * behind, the overlay's own controls included, goes inert. AnimalOverlay is still to migrate:
 * route-driven, so pass `open` always and call `router.back()` in `onClose`.
 */
export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  closeLabel: string;
  /** While true Esc, the backdrop and the close button do nothing (a save is in flight and must show its answer). */
  locked?: boolean;
  /** Replaces the title's place in the close button's row; the title then sits below that row. */
  header?: ReactNode;
  /**
   * Mascots sitting on the dialog's top edge, right side. The dialog then stops clipping and the
   * content box scrolls instead, so only a dialog that sets this pays for the change.
   */
  perched?: ReactNode;
  /** Harness hooks, as on Sheet. */
  dialogTestId?: string;
  closeTestId?: string;
  children: ReactNode;
};

export function Modal({
  open,
  onClose,
  title,
  description,
  closeLabel,
  locked = false,
  header,
  perched,
  dialogTestId,
  closeTestId,
  children,
}: ModalProps) {
  const id = useId();
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const { ref, onBackdropClick } = useDialogCore({ open, onClose, initialFocusRef: titleRef });

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Esc is native on a modal <dialog>; the click only handles the backdrop.
    <dialog
      ref={ref}
      data-testid={dialogTestId}
      aria-labelledby={`${id}-title`}
      aria-describedby={description === undefined ? undefined : `${id}-desc`}
      onClick={locked ? undefined : onBackdropClick}
      onCancel={(event) => {
        if (locked) event.preventDefault();
      }}
      className={cx(
        "fixed inset-x-0 bottom-0 top-auto m-0 w-full max-w-none rounded-t-panel border-0 bg-surface p-0 text-ink backdrop:bg-ink/40",
        perched === undefined ? "overflow-y-auto" : "overflow-visible",
        "max-h-dvh tablet:inset-0 tablet:m-auto tablet:h-fit tablet:max-w-xl tablet:rounded-card",
      )}
    >
      {perched === undefined ? null : (
        <MascotPerch perch="top-right" offset={24}>
          {perched}
        </MascotPerch>
      )}
      <div
        className={cx(
          "flex flex-col gap-5 p-5 pb-safe tablet:p-8",
          perched !== undefined && "max-h-dvh overflow-y-auto rounded-t-panel tablet:rounded-card",
        )}
      >
        <span
          aria-hidden="true"
          className="mx-auto -mt-2 h-1 w-10 rounded-pill bg-muted tablet:hidden"
        />
        <div className="flex items-start justify-between gap-4">
          {header === undefined ? (
            <h2 id={`${id}-title`} ref={titleRef} tabIndex={-1} className="text-title text-ink">
              {title}
            </h2>
          ) : (
            <div className="min-w-0 flex-1">{header}</div>
          )}
          <button
            type="button"
            aria-label={closeLabel}
            aria-disabled={locked || undefined}
            data-testid={closeTestId}
            onClick={() => {
              if (!locked) ref.current?.close();
            }}
            className="inline-flex size-target shrink-0 cursor-pointer items-center justify-center rounded-pill bg-page text-ink focus-ring"
          >
            <Icon name="close" />
          </button>
        </div>
        {header === undefined ? null : (
          <h2 id={`${id}-title`} ref={titleRef} tabIndex={-1} className="text-title text-ink">
            {title}
          </h2>
        )}
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
