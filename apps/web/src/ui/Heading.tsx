import type { ReactNode, Ref } from "react";
import { cx } from "./cx";

/**
 * Headings are 700 (Bellota reads light). `level` is the document outline (h1..h4), `look` the type
 * scale step, so a section can be an h2 that looks like a title without a one-off class.
 */
const LOOK = {
  "display-xl": "font-display text-display-xl",
  "display-l": "font-display text-display-l",
  title: "text-title",
  /** A form or page section: 20px bold on a phone, the 26px title from tablet. */
  section: "text-body-l font-bold tablet:text-title",
  "body-l": "text-body-l font-bold",
} as const;

const DEFAULT_LOOK = { 1: "display-l", 2: "title", 3: "body-l", 4: "body-l" } as const;

export type HeadingProps = {
  level: 1 | 2 | 3 | 4;
  look?: keyof typeof LOOK;
  id?: string;
  /**
   * -1 makes the heading a programmatic focus target (an error summary, a section the page jumps
   * to) without adding it to the tab order; 0 puts it in the tab order and is rarely right.
   */
  tabIndex?: -1 | 0;
  ref?: Ref<HTMLHeadingElement>;
  className?: string;
  children: ReactNode;
};

export function Heading({ level, look, id, tabIndex, ref, className, children }: HeadingProps) {
  const Tag = `h${level}` as const;
  return (
    <Tag
      id={id}
      ref={ref}
      tabIndex={tabIndex}
      className={cx(
        "text-ink",
        LOOK[look ?? DEFAULT_LOOK[level]],
        tabIndex === undefined ? "" : "focus-ring",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
