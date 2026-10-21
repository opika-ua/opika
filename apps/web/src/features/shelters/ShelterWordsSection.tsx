import { uk } from "@opika/i18n";
import { useId } from "react";
import type { ShelterWords } from "./shelter-words";

/**
 * «Слова притулку» on the shelter page: the shelter's description and its
 * sentence about how current its cards are, under the one heading. The only
 * place either renders for adopters (Oleksii's DR1-Q1, verbatim: "«Слова
 * притулку» only on the shelter page."), and the block K4's voice preview
 * shows, so the preview can't drift from the page it claims to show
 * (`voice.previewLabel`).
 *
 * The caller passes null for a shelter that wrote neither, and nothing is
 * rendered (`shelterWordsOf`). The sentence sits in «…», as
 * `docs/design/README.md` ("The shelter's sentence") specifies.
 *
 * `headingLevel`: a section of its page (2), or of the kabinet card that
 * previews it (3).
 */
export function ShelterWordsSection({
  words,
  headingLevel,
}: {
  words: ShelterWords | null;
  headingLevel: 2 | 3;
}) {
  const headingId = useId();
  if (words === null) return null;
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-row rounded-rg-button bg-rg-fill p-group"
    >
      <Heading id={headingId} className="text-base font-medium text-rg-ink">
        {uk.freshness.attribution}
      </Heading>
      {words.description !== null && (
        <p className="whitespace-pre-line text-base text-rg-ink">{words.description}</p>
      )}
      {words.sentence !== null && (
        <p data-testid="shelter-freshness-sentence" className="text-base text-rg-ink">
          «{words.sentence}»
        </p>
      )}
    </section>
  );
}
