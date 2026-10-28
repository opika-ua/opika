import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * Body copy. `body` 16px, `lead` 20px, `hint` 14px in ink-2 (never lighter, AA), `label` 16px at 600.
 * 14px is the smallest text anywhere in the product.
 */
const LOOK = {
  body: "text-body text-ink",
  lead: "text-body-l text-ink",
  hint: "text-caption text-ink-2",
  label: "text-label text-ink",
} as const;

export type TextProps = {
  look?: keyof typeof LOOK;
  as?: "p" | "span" | "div";
  id?: string;
  className?: string;
  children: ReactNode;
};

export function Text({ look = "body", as: Tag = "p", id, className, children }: TextProps) {
  return (
    <Tag id={id} className={cx(LOOK[look], className)}>
      {children}
    </Tag>
  );
}
