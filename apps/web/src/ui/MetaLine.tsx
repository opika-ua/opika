import { cx } from "./cx";

/**
 * «Хлопчик · дорослий · середній»: parts joined by a drawn separator, which screen readers skip.
 * The separator trails the part before it and wraps with it, so a wrapped line never starts with one.
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
    <span
      data-testid={testId}
      className={cx("meta-line", size === "caption" ? "text-caption" : "text-label", className)}
    >
      {parts.map((part) => (
        <span key={part} className="meta-part">
          {part}
        </span>
      ))}
    </span>
  );
}
