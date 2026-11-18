import { cx } from "./cx";
import { InlineList } from "./InlineList";

/**
 * «Хлопчик · дорослий · середній»: facts on an `InlineList`, so a drawn separator never ends or
 * starts a line (owner, 2026-11-18) and screen readers skip it. Each fact stays unbroken.
 */
/** `size` caption (14px) is for a narrow card column; the default is the 16px label. */
export function MetaLine({
  parts,
  size = "label",
  className,
  testId,
}: {
  parts: readonly string[];
  size?: "label" | "caption";
  className?: string;
  /** Lets a card name its meta line for tests without a wrapper element. */
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={cx(size === "caption" ? "text-caption" : "text-label", "text-ink-2", className)}
    >
      <InlineList items={parts} itemWrap="never" />
    </div>
  );
}
