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
      className={`inline-flex h-16 cursor-pointer items-center justify-center rounded-brand-pill ${TONE_CLASS[tone]} px-11 text-[20px] font-semibold text-brand-on-ink focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-brand-accent focus-visible:outline-offset-[3px] disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      {...props}
    />
  );
});
