import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * Headings are 700 (Bellota reads light). `level` is the document outline (h1..h4), `look` the type
 * scale step, so a section can be an h2 that looks like a title without a one-off class.
 */
const LOOK = {
  "display-xl": "font-display text-display-xl",
  "display-l": "font-display text-display-l",
  title: "text-title",
  "body-l": "text-body-l font-bold",
} as const;

const DEFAULT_LOOK = { 1: "display-l", 2: "title", 3: "body-l", 4: "body-l" } as const;

export type HeadingProps = {
  level: 1 | 2 | 3 | 4;
  look?: keyof typeof LOOK;
  id?: string;
  className?: string;
  children: ReactNode;
};

export function Heading({ level, look, id, className, children }: HeadingProps) {
  const Tag = `h${level}` as const;
  return (
    <Tag id={id} className={cx("text-ink", LOOK[look ?? DEFAULT_LOOK[level]], className)}>
      {children}
    </Tag>
  );
}
