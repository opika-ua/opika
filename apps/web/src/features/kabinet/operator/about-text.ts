import {
  ANIMAL_DESCRIPTION_MAX_CHARACTERS,
  characterCount,
  SHELTER_DESCRIPTION_TOO_LONG_MESSAGE,
} from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import { refusedWithIssueMessage } from "./display-name";

/**
 * The shelter's text on the operator's two forms (S2's optional field and S4's editor). Both say
 * the cap on the field instead of cutting the typing short, and the server checks it again.
 */

const integer = new Intl.NumberFormat("uk");

/** The text as it is saved: trimmed, or null for a blank one (it means none). */
export const aboutInputOf = (typed: string): string | null => typed.trim() || null;

/** Characters past the cap, as the server counts them after trimming; 0 when it fits. */
export const aboutOverBy = (typed: string): number =>
  Math.max(0, characterCount(typed.trim()) - ANIMAL_DESCRIPTION_MAX_CHARACTERS);

/** «Текст довший за 1 500 символів. Скоротіть його, щоб зберегти.» */
export const aboutTooLongMessage = (): string =>
  fillTemplate(uk.kabinet.profileEdit.errors.aboutTooLong, {
    max: integer.format(ANIMAL_DESCRIPTION_MAX_CHARACTERS),
  });

/** The counter line: the animal form's «{count} з {max} символів» or «Зайвих символів: {over}». */
export const aboutCounterText = (typed: string): string => {
  const counter = uk.kabinet.animalForm.description;
  const over = aboutOverBy(typed);
  return over > 0
    ? fillTemplate(counter.counterOver, { over: integer.format(over) })
    : fillTemplate(counter.counter, {
        count: integer.format(characterCount(typed.trim())),
        max: integer.format(ANIMAL_DESCRIPTION_MAX_CHARACTERS),
      });
};

/** Reached when the server counts more than the page did (a browser segmenting an emoji differently). */
export const refusedForAboutLength = (error: unknown): boolean =>
  refusedWithIssueMessage(error, SHELTER_DESCRIPTION_TOO_LONG_MESSAGE);
