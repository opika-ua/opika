import { z } from "zod";

/**
 * The one slot a shelter's freshness sentence may carry (VH-Q1, K-Q6). It is
 * filled with the animal's name in its base form, so it only reads right
 * where the nominative does: Ukrainian names aren't declined here.
 *
 * The apostrophe is U+02BC MODIFIER LETTER APOSTROPHE, the letter-apostrophe
 * Ukrainian orthography uses inside a word. Every accepted spelling is
 * normalised to this one before storage, so substitution matches a single
 * exact string and never has to guess.
 */
export const ANIMAL_NAME_TOKEN = "{імʼя}";

/** K-Q6: 280 characters, counted as a reader sees them, after normalisation. */
export const FRESHNESS_SENTENCE_MAX_CHARACTERS = 280;

/** S2: 60 characters, counted the same way, after trimming. */
export const ANIMAL_NAME_MAX_CHARACTERS = 60;

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

/**
 * The spellings a person actually types for the token: the ASCII apostrophe,
 * the typographic ’ (and ‘, which autocorrect sometimes produces), the
 * letter-apostrophe ʼ, the turned comma ʻ, and the backtick, which is what the
 * apostrophe key gives on a US layout while the writer believes they are on
 * the Ukrainian one. Matched case-insensitively ({Імʼя}, {ІМ'Я}). Nothing
 * looser: spaces inside the braces or a Latin "i" stay unknown tokens, and the
 * shelter is told so rather than having a guess stored on their behalf.
 */
const NAME_TOKEN_SPELLINGS = /\{ім['‘’ʼʻ`]я\}/giu;
const ANY_BRACED = /\{[^{}]*\}/gu;
const ANY_BRACE = /[{}]/u;

export type FreshnessSentenceProblem =
  | { readonly kind: "too_long"; readonly characters: number; readonly max: number }
  /** Any `{…}` but the name token: `{дата}`, `{name}`. Nothing else is ever filled in. */
  | { readonly kind: "unknown_token"; readonly token: string }
  | { readonly kind: "stray_brace" };

export type FreshnessSentenceNormalization =
  | { readonly kind: "ok"; readonly text: string }
  | { readonly kind: "empty" }
  | { readonly kind: "invalid"; readonly problem: FreshnessSentenceProblem };

/**
 * Checks and normalises one language's sentence text, the same way on every
 * write path (the kabinet, the registry, the onboarding script). Braces are
 * refused outside the token because the text is shown verbatim: a `{дата}`
 * nobody fills in would reach adopters as literal braces.
 */
export const normalizeFreshnessSentenceText = (raw: string): FreshnessSentenceNormalization => {
  const trimmed = raw.trim();
  if (trimmed === "") return { kind: "empty" };
  const text = trimmed.replace(NAME_TOKEN_SPELLINGS, ANIMAL_NAME_TOKEN);
  const unknown = [...text.matchAll(ANY_BRACED)].find(([braced]) => braced !== ANIMAL_NAME_TOKEN);
  if (unknown !== undefined) {
    return { kind: "invalid", problem: { kind: "unknown_token", token: unknown[0] } };
  }
  if (ANY_BRACE.test(text.replaceAll(ANIMAL_NAME_TOKEN, ""))) {
    return { kind: "invalid", problem: { kind: "stray_brace" } };
  }
  const characters = characterCount(text);
  if (characters > FRESHNESS_SENTENCE_MAX_CHARACTERS) {
    return {
      kind: "invalid",
      problem: { kind: "too_long", characters, max: FRESHNESS_SENTENCE_MAX_CHARACTERS },
    };
  }
  return { kind: "ok", text };
};

/**
 * Fills every token with the animal's name. Only the deck and the animal page
 * call this (K-Q6); the kabinet shows the sentence as the shelter wrote it.
 * The replacer is a function so a name is inserted literally: a string
 * replacement would read `$&` or `$1` in a name as a pattern.
 */
export const fillAnimalName = (text: string, animalName: string): string =>
  text.replaceAll(ANIMAL_NAME_TOKEN, () => animalName);

export type AnimalNameProblem =
  | { readonly kind: "empty" }
  /** A name is substituted into the sentence, so one carrying braces could fake a token there. */
  | { readonly kind: "brace" }
  | { readonly kind: "too_long"; readonly characters: number; readonly max: number };

export const animalNameProblem = (name: string): AnimalNameProblem | null => {
  const trimmed = name.trim();
  if (trimmed === "") return { kind: "empty" };
  if (ANY_BRACE.test(trimmed)) return { kind: "brace" };
  const characters = characterCount(trimmed);
  if (characters > ANIMAL_NAME_MAX_CHARACTERS) {
    return { kind: "too_long", characters, max: ANIMAL_NAME_MAX_CHARACTERS };
  }
  return null;
};

/**
 * K3's limit (docs/design/KABINET.md), counted as characters like the
 * sentence and the name. Here rather than in contracts so the onboarding
 * script (packages/db) applies the same cap: a longer onboarded description
 * couldn't be saved again in K3 until the shelter cut it (review finding 6).
 */
export const ANIMAL_DESCRIPTION_MAX_CHARACTERS = 1500;

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

export const freshnessSentenceProblemMessage = (problem: FreshnessSentenceProblem): string => {
  switch (problem.kind) {
    case "too_long":
      return `Freshness sentence is ${problem.characters} characters; the maximum is ${problem.max}`;
    case "unknown_token":
      return `Freshness sentence contains ${problem.token}; the only placeholder is ${ANIMAL_NAME_TOKEN}`;
    case "stray_brace":
      return `Freshness sentence contains a brace outside ${ANIMAL_NAME_TOKEN}`;
  }
};

export const animalNameProblemMessage = (problem: AnimalNameProblem): string => {
  switch (problem.kind) {
    case "empty":
      return "Animal name is empty";
    case "brace":
      return "Animal name may not contain braces";
    case "too_long":
      return `Animal name is ${problem.characters} characters; the maximum is ${problem.max}`;
  }
};

/**
 * The name as any write path accepts it, shared by the kabinet's inputs and
 * the onboarding script so both apply the same rule. The stored
 * `AnimalSchema.name` stays as it was: this is a property of new input.
 */
export const AnimalNameInputSchema = z
  .string()
  .trim()
  .superRefine((name, ctx) => {
    const problem = animalNameProblem(name);
    if (problem !== null) {
      ctx.addIssue({ code: "custom", message: animalNameProblemMessage(problem) });
    }
  });
