import type { ReactNode } from "react";
import { cx } from "./cx";

/** The big rounded container (24px): a gallery card's frame, a pet card section. Panel is the smaller inner box. */
const TONE = {
  surface: "bg-surface",
  page: "bg-page",
  outline: "border-2 border-line bg-surface",
} as const;

export type CardProps = {
  as?: "div" | "article" | "section" | "li";
  tone?: keyof typeof TONE;
  /** Layout only: margin, width, aspect ratio. */
  className?: string;
  /** A named region: `id` for an anchor, `aria-labelledby` for the heading that names it. */
  id?: string;
  "aria-labelledby"?: string;
  children: ReactNode;
};

export function Card({
  as: Tag = "div",
  tone = "surface",
  className,
  children,
  ...attributes
}: CardProps) {
  return (
    <Tag className={cx("overflow-clip rounded-card", TONE[tone], className)} {...attributes}>
      {children}
    </Tag>
  );
}
