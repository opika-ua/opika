import type { FreshnessKind } from "@opika/domain";
import { cx } from "./cx";

/**
 * How recently a listing was confirmed: three pips and the day count in words, always both (a
 * pip alone is colour and shape, never the whole message). Never red or amber, never opacity:
 * the filled count says how far the last confirmation has travelled, and the words say the rest.
 * `freshness-display` in `packages/ui` stays the source of truth for which pips are filled
 * (`FreshnessPips.test.tsx` fails if the two disagree); this is the same marker on the kit's
 * tokens. The deck's `SwipeCard` still draws its own until it moves onto the kit.
 */
type Fill = "success" | "muted" | "ink" | "empty";

const FILLS: Record<FreshnessKind, readonly [Fill, Fill, Fill]> = {
  fresh: ["success", "empty", "empty"],
  aging: ["muted", "muted", "empty"],
  stale: ["muted", "muted", "ink"],
};

const PIP: Record<Fill, string> = {
  success: "bg-success",
  muted: "bg-ink-2",
  ink: "bg-ink",
  empty: "border-2 border-ink-2",
};

export function FreshnessPips({
  kind,
  label,
  className,
}: {
  kind: FreshnessKind;
  /** The day count in words («Оновлено 3 дні тому»), from the caller's catalogue. Required: pips never stand alone. */
  label: string;
  /** Layout only. */
  className?: string;
}) {
  return (
    <span className={cx("flex items-center gap-2", className)}>
      <span aria-hidden="true" data-fill={FILLS[kind].join(" ")} className="flex shrink-0 gap-1">
        {FILLS[kind].map((fill, index) => (
          // The three positions never change, so the index is the identity.
          <span key={index} className={cx("size-3 rounded-pill", PIP[fill])} />
        ))}
      </span>
      <span className="text-body text-ink">{label}</span>
    </span>
  );
}
