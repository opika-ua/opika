import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * A small tag that sits on a photo (freshness, reserved). Species colours carry identity only;
 * freshness itself is never red or amber (docs/standing-constraints.md), so there is no warning tone.
 */
const TONE = {
  dog: "bg-species-dog text-on-ink",
  cat: "bg-species-cat text-on-accent",
  ink: "bg-ink text-on-ink",
  neutral: "bg-line text-ink",
} as const;

export type BadgeProps = { tone: keyof typeof TONE; className?: string; children: ReactNode };

export function Badge({ tone, className, children }: BadgeProps) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-tag px-2 py-1 text-caption",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
