import type { Freshness } from "@opika/domain";
import { formatFreshnessRelative } from "@opika/domain/core";
import { ukPublic as strings } from "@opika/i18n/public";

/**
 * Human-readable label: "Оновлено 3 дні тому" via Intl.RelativeTimeFormat.
 */
export function freshnessLabel(freshness: Freshness): string {
  const relative = formatFreshnessRelative(freshness, "uk");
  return strings.freshness.updatedAgo.replace("{days}", relative);
}
