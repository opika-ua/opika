import type { Freshness, FreshnessKind } from "@opika/domain";
import { formatFreshnessRelative } from "@opika/domain";
import { uk as strings } from "./strings.uk.js";
import { color } from "./tokens.js";

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
 * Returning an array of fill colours rather than a count, because the
 * stale state uses two different fill colours.
 */
export type PipFill = string | null;

export function freshnessPips(kind: FreshnessKind): [PipFill, PipFill, PipFill] {
  switch (kind) {
    case "fresh":
      return [color.leaf, null, null];
    case "aging":
      return [color.ink4, color.ink4, null];
    case "stale":
      return [color.ink4, color.ink4, color.ink];
  }
}

/**
 * Human-readable label: "Оновлено 3 дні тому" via Intl.RelativeTimeFormat.
 */
export function freshnessLabel(freshness: Freshness): string {
  const relative = formatFreshnessRelative(freshness, "uk");
  return `${strings.freshness.updatedAgo.replace("{days}", relative)}`;
}
