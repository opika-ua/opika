"use client";

import type { ButtonHTMLAttributes } from "react";
import { forwardRef } from "react";

/**
 * The panel header's own two pills (Figma `75:425`) - «Дати сімʼю»
 * (`RevealFlow.tsx`) and «Поділитись» (`ShareButton.tsx`) - share every
 * dimension and only differ by fill colour; one component instead of two
 * copies of the same className string. `forwardRef`: `RevealFlow` returns
 * focus to its own trigger when the reveal dialog closes, so the DOM node
 * has to be reachable from outside.
 *
 * `cursor-pointer` explicit: Tailwind's own preflight resets `button` to
 * `cursor: default`, so every clickable `<button>` in this app needs it
 * stated, not inherited.
 */
const TONE_CLASS = {
  accent: "bg-brand-accent",
  ink: "bg-brand-ink",
} as const;

interface PillButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone: keyof typeof TONE_CLASS;
}

export const PillButton = forwardRef<HTMLButtonElement, PillButtonProps>(function PillButton(
  { tone, className = "", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      // Found live, not assumed: `h-16 px-11 text-[20px]` at every width is desktop sizing
      // worn on a phone - «Дати сім'ю» has no room beside the other header controls at
      // 360px and wraps mid-phrase. Below `desktop:`, a smaller step (52px tall, same
      // "Test logic, not looks" era convention as `ContentPageLayout.tsx`'s own
      // `text-[34px]/[1.1] desktop:text-[48px]/[1.1]` h1) - still comfortably over the
      // 48px touch floor, just proportionate to a phone instead of a 1440px panel.
      className={`inline-flex h-13 cursor-pointer items-center justify-center rounded-brand-pill ${TONE_CLASS[tone]} px-6 text-[16px] font-semibold text-brand-on-ink focus-ring disabled:cursor-not-allowed disabled:opacity-60 desktop:h-16 desktop:px-11 desktop:text-[20px] ${className}`}
      {...props}
    />
  );
});
