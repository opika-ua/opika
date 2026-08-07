import type { Freshness, FreshnessKind } from "@opika/domain";
import { formatFreshnessRelative } from "@opika/domain";
import { uk as strings } from "@opika/i18n";

/**
 * Per-pip fill state for the freshness marker.
 *
 * The design specifies three pips, always three, always in the same
 * position. Filled pips count how far the last confirmation has
 * travelled:
 *
 *   fresh  (<=7d):  1 filled leaf,     2 empty
 *   aging  (8-30d): 2 filled ink-4,    1 empty
 *   stale  (30d+):  2 filled ink-4 + 1 filled ink  (all three filled)
 *
 * Returning an array of Tailwind background-colour classes rather than a
 * count, because the stale state uses two different fill colours. These
 * name the same tokens `globals.css`'s `@theme` block defines
 * (`--color-leaf`, `--color-ink-4`, `--color-ink`) — not raw hex, so a
 * rename of the underlying colour in the theme doesn't silently orphan
 * the value returned here.
 *
 * A closed union of the three class names, not `string`. A misspelt
 * Tailwind class has no failure mode of its own: it emits no rule, the
 * build stays green, and the pip simply renders unstyled — the freshness
 * signal degrades into three identical dots and nothing anywhere says so.
 * Enumerating the three makes that a compile error instead.
 */
export type PipFill = "bg-leaf" | "bg-ink-4" | "bg-ink" | null;

export function freshnessPips(kind: FreshnessKind): [PipFill, PipFill, PipFill] {
  switch (kind) {
    case "fresh":
      return ["bg-leaf", null, null];
    case "aging":
      return ["bg-ink-4", "bg-ink-4", null];
    case "stale":
      return ["bg-ink-4", "bg-ink-4", "bg-ink"];
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled variant; unreachable at runtime */
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

/**
 * Human-readable label: "Оновлено 3 дні тому" via Intl.RelativeTimeFormat.
 */
export function freshnessLabel(freshness: Freshness): string {
  const relative = formatFreshnessRelative(freshness, "uk");
  return strings.freshness.updatedAgo.replace("{days}", relative);
}
