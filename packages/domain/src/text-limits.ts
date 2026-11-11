/** S2: 60 characters, counted the same way, after trimming. */
export const ANIMAL_NAME_MAX_CHARACTERS = 60;

/**
 * K3's limit (docs/design/KABINET.md), counted as characters. Shared by the
 * animal form, the shelter's own description and the onboarding script, so a
 * longer onboarded text couldn't be saved again until the shelter cut it.
 */
export const ANIMAL_DESCRIPTION_MAX_CHARACTERS = 1500;

/**
 * Built on first use, never at module load: this module ships in client
 * bundles (the deck, the animal page), and a browser without
 * `Intl.Segmenter` (Firefox before 125) would otherwise throw while loading
 * it and break hydration for a page that never counts anything (review
 * finding 3).
 */
let graphemes: Intl.Segmenter | undefined;

const graphemeSegmenter = (): Intl.Segmenter | undefined => {
  if (graphemes === undefined && typeof Intl.Segmenter === "function") {
    graphemes = new Intl.Segmenter("uk", { granularity: "grapheme" });
  }
  return graphemes;
};

/**
 * Characters as a person counts them: an emoji, a flag or a letter with a
 * combining accent is one. `String.length` counts UTF-16 units, so a limit
 * measured that way would cut a shelter off early for writing «🐾» and
 * disagree with whatever counter the form shows.
 *
 * Without `Intl.Segmenter` this falls back to code points rather than
 * throwing. That over-counts a ZWJ sequence, a flag, a skin tone or a
 * combining accent, so an old browser's counter is stricter than the limit,
 * never looser. The server (Node 24, which has `Intl.Segmenter`) is the one
 * whose count is enforced.
 */
export const characterCount = (text: string): number => {
  const segmenter = graphemeSegmenter();
  return segmenter === undefined ? [...text].length : [...segmenter.segment(text)].length;
};

export type AnimalDescriptionProblem = {
  readonly kind: "too_long";
  readonly characters: number;
  readonly max: number;
};

/** One language's description text against the cap; `null` when it fits. */
export const animalDescriptionProblem = (text: string): AnimalDescriptionProblem | null => {
  const characters = characterCount(text);
  return characters > ANIMAL_DESCRIPTION_MAX_CHARACTERS
    ? { kind: "too_long", characters, max: ANIMAL_DESCRIPTION_MAX_CHARACTERS }
    : null;
};

export const animalDescriptionProblemMessage = (problem: AnimalDescriptionProblem): string =>
  `Description is ${problem.characters} characters; the maximum is ${problem.max}`;

/** Fixed text, matched by the editor to show its own message (like the contact cap's). */
export const SHELTER_DESCRIPTION_TOO_LONG_MESSAGE = `The shelter description is longer than ${ANIMAL_DESCRIPTION_MAX_CHARACTERS} characters`;
