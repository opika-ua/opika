import type { Freshness, FreshnessKind } from "@opika/domain";
import { formatFreshnessRelative } from "@opika/domain";
import { uk as strings } from "@opika/i18n";

/**
 * Per-pip fill state for the freshness marker: three pips, always three, always in the same
 * position; the filled ones count how far the last confirmation has travelled.
 *
 *   fresh  (<=7d):  1 filled, 2 empty
 *   aging  (8-30d): 2 filled, 1 empty
 *   stale  (30d+):  3 filled (the last in the strongest tone)
 *
 * `"empty"` is drawn as an outline, not a pale fill (WCAG 1.4.11: the fill measured 1.16-1.37:1,
 * `docs/design/README.md`, "The freshness marker"). A closed union, so a typo is a compile
 * error. The tone names are the kit's (`apps/web/src/ui/FreshnessPips.tsx` maps them to tokens).
 */
export type PipFill = "success" | "muted" | "ink" | "empty";

export function freshnessPips(kind: FreshnessKind): [PipFill, PipFill, PipFill] {
  switch (kind) {
    case "fresh":
      return ["success", "empty", "empty"];
    case "aging":
      return ["muted", "muted", "empty"];
    case "stale":
      return ["muted", "muted", "ink"];
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
