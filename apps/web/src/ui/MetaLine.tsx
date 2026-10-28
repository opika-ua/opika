import { cx } from "./cx";

/** «Хлопчик · дорослий · середній»: parts joined by a drawn separator, which screen readers skip. */
export function MetaLine({ parts, className }: { parts: readonly string[]; className?: string }) {
  return (
    <span className={cx("flex flex-wrap items-center gap-x-2 text-label text-ink-2", className)}>
      {parts.map((part, index) => (
        <span key={part} className="flex items-center gap-2">
          {index > 0 ? <span aria-hidden="true" className="h-1 w-0.5 shrink-0 bg-ink-2" /> : null}
          {part}
        </span>
      ))}
    </span>
  );
}
