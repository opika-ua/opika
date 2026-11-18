import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * Items on a line, joined by a drawn separator that never ends a line (owner, 2026-11-18). Each
 * separator leads the item after it; an item that wraps to a new line takes its separator into the
 * clipped gutter, so neither end of a line shows one. Screen readers never meet it (a pseudo-element).
 */
export function InlineList({
  items,
  itemWrap = "allowed",
  className,
}: {
  /** Text or controls; a control keeps its focus ring (the row clips sideways only, with room for it). */
  items: readonly ReactNode[];
  /** `never`: each item stays on one line (short facts); the row still wraps between items. */
  itemWrap?: "allowed" | "never";
  /** Layout only. */
  className?: string;
}) {
  return (
    <div className={cx("inline-list", className)}>
      <div className={cx("inline-list-row", itemWrap === "never" && "inline-list-nowrap")}>
        {items.map((item, index) => (
          // A static row in a fixed order: the position is the identity.
          // biome-ignore lint/suspicious/noArrayIndexKey: the items never reorder
          <span key={index}>{item}</span>
        ))}
      </div>
    </div>
  );
}
