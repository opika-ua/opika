import type { Freshness, FreshnessKind } from "@opika/domain";
import { formatFreshnessRelative } from "@opika/domain";
import { uk as strings } from "@opika/i18n";

/**
 * Per-pip fill state for the freshness marker — the «Реєстр» visual
 * system's values (V2, `docs/design/README.md` "The freshness marker").
 * Both of this function's callers (`AnimalCard`, `SwipeCard`) are in V2's
 * scope, so this returns the new system's tokens directly rather than
 * keeping a parallel old/new version of a three-line function.
 *
 * The design specifies three pips, always three, always in the same
 * position. Filled pips count how far the last confirmation has
 * travelled:
 *
 *   fresh  (<=7d):  1 filled registry, 2 empty
 *   aging  (8-30d): 2 filled ink-3,    1 empty
 *   stale  (30d+):  2 filled ink-3 + 1 filled ink  (all three filled)
 *
 * `"empty"` is a deliberate departure from the mock, not a value it
 * specifies — see `docs/design/README.md`'s own note under "The freshness
 * marker" for the full reasoning and the measured contrast ratios
 * (owner-approved: the mock's `#DCDCD9` fill measured 1.16-1.37:1 against
 * every background it appears on, failing WCAG 1.4.11's 3:1 by a wide
 * margin). The caller renders `"empty"` as a transparent fill with a
 * border in the same colour as `"bg-rg-ink-3"`, not as its own fill colour
 * — kept as a fourth named variant here, not spelled out as classes,
 * for the same reason the three fills are: a closed union turns a typo
 * into a compile error instead of a pip that silently renders unstyled.
 */
export type PipFill = "bg-rg-registry" | "bg-rg-ink-3" | "bg-rg-ink" | "empty";

export function freshnessPips(kind: FreshnessKind): [PipFill, PipFill, PipFill] {
  switch (kind) {
    case "fresh":
      return ["bg-rg-registry", "empty", "empty"];
    case "aging":
      return ["bg-rg-ink-3", "bg-rg-ink-3", "empty"];
    case "stale":
      return ["bg-rg-ink-3", "bg-rg-ink-3", "bg-rg-ink"];
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
