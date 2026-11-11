import { z } from "zod";
import { ANIMAL_NAME_MAX_CHARACTERS, characterCount } from "../text-limits";

// Re-exported so imports from this file keep working; the definitions live in text-limits.
export {
  ANIMAL_DESCRIPTION_MAX_CHARACTERS,
  ANIMAL_NAME_MAX_CHARACTERS,
  type AnimalDescriptionProblem,
  animalDescriptionProblem,
  animalDescriptionProblemMessage,
  characterCount,
} from "../text-limits";

/**
 * The animal-name slot the sentence used to carry (VH-Q1, K-Q6), now refused.
 * The sentence is shelter-level since designer round 1: it shows only on the
 * shelter page, where no single animal's name could fill it. Oleksii's DR1-Q5,
 * verbatim: "DR1-Q5: (a), drop {імʼя}. The sentence is shelter-level, and the
 * editor refuses {імʼя}." Every write path refuses it (the kabinet, the
 * registry, the onboarding script), so a sentence stored from now on can't
 * carry one; a sentence stored before still might, until it is re-saved (his
 * words: "Existing test-shelter sentences containing it are re-saved, not
 * migrated."), which is why readers check `carriesAnimalNameToken`.
 *
 * The apostrophe is U+02BC MODIFIER LETTER APOSTROPHE, the letter-apostrophe
 * Ukrainian orthography uses inside a word, and the spelling earlier writes
 * normalised every variant to.
 */
export const ANIMAL_NAME_TOKEN = "{імʼя}";

/** K-Q6: 280 characters, counted as a reader sees them, after normalisation. */
export const FRESHNESS_SENTENCE_MAX_CHARACTERS = 280;

/**
 * The spellings a person actually types for the old token: the ASCII apostrophe,
 * the typographic ’ (and ‘, which autocorrect sometimes produces), the
 * letter-apostrophe ʼ, the turned comma ʻ, and the backtick, which is what the
 * apostrophe key gives on a US layout while the writer believes they are on
 * the Ukrainian one. Matched case-insensitively ({Імʼя}, {ІМʼЯ}). Nothing
 * looser: spaces inside the braces or a Latin "i" stay unknown tokens. Each of
 * these gets its own refusal, so a shelter who learnt the token is told why it
 * has gone rather than that it was never known.
 */
const NAME_TOKEN_SPELLINGS = /\{ім['‘’ʼʻ`]я\}/iu;
const ANY_BRACED = /\{[^{}]*\}/u;
const ANY_BRACE = /[{}]/u;

export type FreshnessSentenceProblem =
  | { readonly kind: "too_long"; readonly characters: number; readonly max: number }
  /** `{імʼя}` in any spelling (DR1-Q5): the sentence no longer belongs to one animal. */
  | { readonly kind: "name_token" }
  /** Any other `{…}`: `{дата}`, `{name}`. Nothing is ever filled in. */
  | { readonly kind: "unknown_token"; readonly token: string }
  | { readonly kind: "stray_brace" };

export type FreshnessSentenceNormalization =
  | { readonly kind: "ok"; readonly text: string }
  | { readonly kind: "empty" }
  | { readonly kind: "invalid"; readonly problem: FreshnessSentenceProblem };

/**
 * Whether a sentence still carries the old name slot, in any spelling. True
 * only for a sentence stored before DR1-Q5 and not yet re-saved; the shelter
 * page leaves such a sentence out rather than show adopters a literal
 * `{імʼя}` it can no longer fill.
 */
export const carriesAnimalNameToken = (text: string): boolean => NAME_TOKEN_SPELLINGS.test(text);

/**
 * Checks and normalises one language's sentence text, the same way on every
 * write path (the kabinet, the registry, the onboarding script). Since DR1-Q5
 * the only normalisation left is trimming. Braces are refused because the
 * text is shown verbatim: a `{дата}` nobody fills in
 * would reach adopters as literal braces.
 */
export const normalizeFreshnessSentenceText = (raw: string): FreshnessSentenceNormalization => {
  const text = raw.trim();
  if (text === "") return { kind: "empty" };
  if (carriesAnimalNameToken(text)) {
    return { kind: "invalid", problem: { kind: "name_token" } };
  }
  const unknown = text.match(ANY_BRACED);
  if (unknown !== null) {
    return { kind: "invalid", problem: { kind: "unknown_token", token: unknown[0] } };
  }
  if (ANY_BRACE.test(text)) {
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

export type AnimalNameProblem =
  | { readonly kind: "empty" }
  /**
   * Refused since K-Q6, when a name was substituted into the sentence and one
   * carrying braces could fake a token there. Nothing substitutes a name since
   * DR1-Q5; the rule stays because loosening what a name accepts is a
   * decision of its own, not a side effect of this one.
   */
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

export const freshnessSentenceProblemMessage = (problem: FreshnessSentenceProblem): string => {
  switch (problem.kind) {
    case "too_long":
      return `Freshness sentence is ${problem.characters} characters; the maximum is ${problem.max}`;
    case "name_token":
      return `Freshness sentence contains ${ANIMAL_NAME_TOKEN}; the sentence is shown on the shelter page, where no animal's name is filled in`;
    case "unknown_token":
      return `Freshness sentence contains ${problem.token}; nothing in braces is filled in`;
    case "stray_brace":
      return "Freshness sentence contains a brace; nothing in braces is filled in";
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
