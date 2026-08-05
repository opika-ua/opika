import type { Freshness, FreshnessKind } from "@opika/domain";
import { formatFreshnessRelative } from "@opika/domain";
import { uk as strings } from "./strings.uk.js";

/**
 * Pip level for the freshness marker: 3 = fresh, 2 = aging, 1 = stale.
 * Never zero — even a stale listing shows one filled pip.
 */
export function freshnessPipLevel(kind: FreshnessKind): number {
  switch (kind) {
    case "fresh":
      return 3;
    case "aging":
      return 2;
    case "stale":
      return 1;
  }
}

/**
 * Human-readable label: "Оновлено 3 дні тому" via Intl.RelativeTimeFormat.
 */
export function freshnessLabel(freshness: Freshness): string {
  const relative = formatFreshnessRelative(freshness, "uk");
  // Capitalize the relative part and prepend "Оновлено"
  return `${strings.freshness.updatedAgo.replace("{days}", relative)}`;
}
