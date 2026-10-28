import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * Max width plus the page gutters (16 on a phone, 24 from tablet, 56 from desktop), centred. The one
 * place page width is decided. `Section` is a vertical block in it, named by its heading.
 */
export function Container({
  as: Tag = "div",
  className,
  children,
}: {
  as?: "div" | "main" | "header" | "footer" | "nav";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag className={cx("mx-auto w-full max-w-350 px-4 tablet:px-6 desktop:px-14", className)}>
      {children}
    </Tag>
  );
}

export function Section({
  labelledBy,
  className,
  children,
}: {
  /** The id of the section's heading; makes it a named landmark. */
  labelledBy?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={labelledBy} className={cx("flex flex-col gap-4 py-6", className)}>
      {children}
    </section>
  );
}
