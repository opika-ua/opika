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

/**
 * The className half of the circle-button look, standalone so a real
 * `<Link>` (the overlay's prev/next - prefetched navigation, not a click
 * handler) can carry the identical visual treatment without going through
 * a `<button>`. `CircleButton` below is this plus the `<button>` element
 * itself; this is the one place the look is actually defined.
 */
export const circleButtonClass = (size: keyof typeof SIZE_CLASS = "md", className = ""): string =>
  // `shrink-0`: found live at narrow widths - the save toggle beside two text pills
  // (`SaveButton` in `AnimalDetailScreen.tsx`) has no flex-basis of its own, so the row's
  // default flex-shrink squeezed its width down to an oval while its height held, since
  // the circle's two axes don't shrink the same way. A fixed-size control should never
  // flex at all; the two text pills next to it are the ones meant to give way or wrap.
  `inline-flex shrink-0 ${SIZE_CLASS[size]} cursor-pointer items-center justify-center rounded-full bg-brand-surface shadow-md focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-brand-ink focus-visible:outline-offset-[3px] disabled:cursor-not-allowed disabled:opacity-60 ${className}`;

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
    <button type="button" className={circleButtonClass(size, className)} {...props}>
      {children}
    </button>
  );
}
