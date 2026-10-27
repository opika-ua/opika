"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * The one circular icon-button look the pet card redesign (Figma `75:425`)
 * reuses three times - the overlay's close button, the photo slider's
 * prev/next, and the save toggle beside the name (restyled off the old
 * `rg-*` `buttonClass("icon")`, which read as a leftover box from the
 * previous design, not this one's bordered/white-circle language) - one
 * component instead of three copies of the same className string drifting
 * apart one fix at a time.
 *
 * `cursor-pointer` explicit: Tailwind's own preflight resets `button` to
 * `cursor: default`, so every clickable `<button>` in this app needs it
 * stated, not inherited.
 */
const SIZE_CLASS = {
  sm: "size-12",
  md: "size-13",
} as const;

interface CircleButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: keyof typeof SIZE_CLASS;
  children: ReactNode;
}

export function CircleButton({
  size = "md",
  className = "",
  children,
  ...props
}: CircleButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex ${SIZE_CLASS[size]} cursor-pointer items-center justify-center rounded-full bg-brand-surface shadow-md focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-brand-ink focus-visible:outline-offset-[3px] disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
