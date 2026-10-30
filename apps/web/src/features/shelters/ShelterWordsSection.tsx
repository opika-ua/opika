import { uk } from "@opika/i18n";
import { useId } from "react";
import { Heading } from "../../ui/Heading";
import { Panel } from "../../ui/Panel";
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
 * previews it (3). `variant` "quote" (the shelter page): a quote block with an accent edge, the
 * heading kept only for assistive tech; "panel" (the kabinet preview): the panel with its visible heading.
 */
export function ShelterWordsSection({
  words,
  headingLevel,
  variant = "panel",
}: {
  words: ShelterWords | null;
  headingLevel: 2 | 3;
  variant?: "panel" | "quote";
}) {
  const headingId = useId();
  if (words === null) return null;
  if (variant === "quote") {
    return (
      <section
        aria-labelledby={headingId}
        className="flex max-w-160 flex-col gap-3 border-l-3 border-accent pl-4"
      >
        <Heading level={headingLevel} look="body-l" id={headingId} className="sr-only">
          {uk.freshness.attribution}
        </Heading>
        {words.description !== null && (
          <p className="whitespace-pre-line text-body text-ink-2">{words.description}</p>
        )}
        {words.sentence !== null && (
          <p data-testid="shelter-freshness-sentence" className="text-body text-ink-2">
            «{words.sentence}»
          </p>
        )}
      </section>
    );
  }
  return (
    <Panel as="section" aria-labelledby={headingId} padding="lg" className="flex flex-col gap-3">
      <Heading level={headingLevel} look="body-l" id={headingId}>
        {uk.freshness.attribution}
      </Heading>
      {words.description !== null && (
        <p className="whitespace-pre-line text-body-l text-ink-2">{words.description}</p>
      )}
      {words.sentence !== null && (
        <p data-testid="shelter-freshness-sentence" className="text-body-l text-ink-2">
          «{words.sentence}»
        </p>
      )}
    </Panel>
  );
}
