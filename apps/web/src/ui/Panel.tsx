import type { ReactNode } from "react";
import { cx } from "./cx";

/** A 20px box that groups related content inside a page or card: a fact block, a notice, a form group. */
const TONE = {
  surface: "bg-surface",
  sunken: "bg-line",
  outline: "border-2 border-line bg-transparent",
} as const;

const PADDING = { md: "p-4", lg: "p-5 desktop:p-6" } as const;

export type PanelProps = {
  as?: "div" | "section" | "aside";
  tone?: keyof typeof TONE;
  padding?: keyof typeof PADDING;
  className?: string;
  children: ReactNode;
  /** A region is named by its heading: pass that heading's id. */
  "aria-labelledby"?: string;
};

export function Panel({
  as: Tag = "div",
  tone = "surface",
  padding = "md",
  className,
  children,
  ...aria
}: PanelProps) {
  return (
    <Tag className={cx("rounded-panel", TONE[tone], PADDING[padding], className)} {...aria}>
      {children}
    </Tag>
  );
}
