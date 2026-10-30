"use client";

import { type ReactNode, useId, useState } from "react";
import { cx } from "./cx";

/**
 * A small «?» button that shows a short explanation under it, for text that matters occasionally
 * but should not take space all the time. A disclosure: `aria-expanded`/`aria-controls`, the panel
 * stays in the flow (no overlay), a second press or Esc on the button closes it. `label` is the
 * button's accessible name (the glyph is decorative).
 */
export function InfoToggle({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  /** Layout only. */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className={cx("flex flex-col items-start gap-2", className)}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        className="inline-flex size-target items-center justify-center rounded-pill text-label text-ink focus-ring"
      >
        <span
          aria-hidden="true"
          className="inline-flex size-7 items-center justify-center rounded-pill border-2 border-line"
        >
          ?
        </span>
      </button>
      {open ? (
        <p id={panelId} className="max-w-prose text-body text-ink-2">
          {children}
        </p>
      ) : null}
    </div>
  );
}
