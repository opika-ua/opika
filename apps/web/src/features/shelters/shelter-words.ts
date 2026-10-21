import type { PublicShelterView } from "@opika/contracts";
import { carriesAnimalNameToken, type FreshnessSentence, textIn } from "@opika/domain";

/** What the «Слова притулку» section shows: each part only if the shelter wrote it. */
export type ShelterWords = {
  description: string | null;
  sentence: string | null;
};

/**
 * The shelter's own words for its page, or null when it wrote none, so the
 * section is omitted rather than shown as a heading over nothing: the
 * attribution never stands over words the shelter didn't write (VH-Q2).
 *
 * A sentence still carrying `{імʼя}` is left out (DR1-Q5): it was written to
 * be filled with an animal's name, there is no animal here to fill it with,
 * and adopters would read the braces literally. It returns once the shelter
 * re-saves it, which the editor now asks for.
 */
export function shelterWordsOf(
  shelter: Pick<PublicShelterView, "description" | "freshnessSentence">,
): ShelterWords | null {
  const description = textIn(shelter.description, "uk").trim() || null;
  const sentence = shownSentence(shelter.freshnessSentence);
  return description === null && sentence === null ? null : { description, sentence };
}

/** The sentence as the shelter page shows it, or null when it won't show one. */
export function shownSentence(sentence: FreshnessSentence): string | null {
  if (sentence === null) return null;
  const text = textIn(sentence, "uk").trim();
  return text === "" || carriesAnimalNameToken(text) ? null : text;
}
