import { cx } from "./cx";

/** Indeterminate progress, announced by its role. The rotation stops under reduced motion. */
export function Spinner({ label, className }: { label: string; className?: string }) {
  return (
    <span role="status" className={cx("inline-flex items-center gap-2 text-ink-2", className)}>
      <span
        aria-hidden="true"
        className="size-5 animate-spin-fast rounded-pill border-2 border-line border-t-ink motion-reduce:animate-none"
      />
      <span className="text-caption">{label}</span>
    </span>
  );
}
