import type { Freshness } from "@opika/domain";
import { uk } from "@opika/i18n";
import { freshnessLabel, freshnessPips } from "@opika/ui";

/**
 * The freshness quote block on an animal's page: the three pips and the day
 * count in words, then the shelter's own sentence and «Слова притулку».
 * Its own component since K4 (N11), whose voice editor previews the sentence
 * in this exact block, so the preview can't drift from the page it claims to
 * show (`voice.previewLabel`: «Так це виглядає на сторінці тварини»).
 *
 * `sentence` arrives already filled (`fillAnimalName`); null renders the pips
 * and day count alone, with no attribution: under the day count alone,
 * «Слова притулку» would credit the shelter with words it never wrote (VH-Q2).
 */
export function ShelterFreshnessBlock({
  freshness,
  sentence,
}: {
  freshness: Freshness;
  sentence: string | null;
}) {
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
      {sentence !== null && (
        <>
          <span data-testid="shelter-freshness-sentence" className="text-[17px]/[26px] text-rg-ink">
            “{sentence}”
          </span>
          <span
            data-testid="shelter-freshness-attribution"
            className="text-[13px]/[18px] text-rg-ink-3"
          >
            {uk.freshness.attribution}
          </span>
        </>
      )}
    </div>
  );
}
