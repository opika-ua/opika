import { z } from "zod";
import { ANIMAL_NAME_MAX_CHARACTERS, characterCount } from "../text-limits";

/** A brace anywhere in a name: refused, see `AnimalNameProblem`. */
const ANY_BRACE = /[{}]/u;

export type AnimalNameProblem =
  | { readonly kind: "empty" }
  /**
   * Refused since K-Q6, when a name was substituted into a sentence and one
   * carrying braces could fake a token there. Nothing substitutes a name any
   * more; the rule stays because loosening what a name accepts is a decision
   * of its own, not a side effect of removing that sentence.
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
