import type { Freshness } from "@opika/domain";
import { freshnessLabel, freshnessPips } from "@opika/ui";

/**
 * The freshness block on an animal's page: the three pips and the day count
 * in words, always both (standing constraints, "Freshness is honest and never
 * alarming").
 *
 * It used to hold the shelter's sentence and «Слова притулку» under the day
 * count, and K4's voice preview drew it. Both moved to the shelter page in
 * designer round 1, S6 (`features/shelters/ShelterWordsSection.tsx`, Oleksii's
 * DR1-Q1), so this is the day count alone.
 */
export function FreshnessBlock({ freshness }: { freshness: Freshness }) {
  const fills = freshnessPips(freshness.kind);
  return (
    <div
      data-testid="freshness-block"
      className="bg-rg-fill rounded-rg-button p-4 flex flex-col gap-2"
    >
      <div className="flex items-center gap-2.5">
        <div className="flex gap-1.5" aria-hidden="true">
          {fills.map((fill, i) => (
            <div
              key={i}
              className={`size-2.5 rounded-full ${fill === "empty" ? "bg-transparent border-[1.5px] border-rg-ink-3" : fill}`}
            />
          ))}
        </div>
        <span className="text-[15px]/[22px] text-rg-ink">{freshnessLabel(freshness)}</span>
      </div>
    </div>
  );
}
