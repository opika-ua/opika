import { characterCount, PASSWORD_MAX_CHARACTERS, PASSWORD_MIN_CHARACTERS } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import type { PasswordRefusal } from "../../../kabinet/password-codes";

/**
 * Oleksii's password sentences (`docs/shelter-passwords-copy-uk.md`), filled.
 * `{min}` and `{max}` come from the policy's own constants, so the sentence and
 * the rule can't drift apart.
 */
export function refusalMessage(refusal: PasswordRefusal): string {
  const copy = uk.kabinet.password;
  switch (refusal) {
    case "too_short":
      return fillTemplate(copy.tooShort, { min: String(PASSWORD_MIN_CHARACTERS) });
    case "too_long":
      return fillTemplate(copy.tooLong, { max: String(PASSWORD_MAX_CHARACTERS) });
    case "contains_personal":
      return copy.personal;
    case "common":
      return copy.common;
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled refusal; unreachable at runtime */
    default: {
      const unreachable: never = refusal;
      return unreachable;
    }
  }
}

/** The live hint under a new password (§9 answer 2: "the live hint shows length"): «Символів: {count} з {min}». */
export const lengthHint = (password: string): string =>
  fillTemplate(uk.kabinet.setPassword.hint, {
    count: String(characterCount(password)),
    min: String(PASSWORD_MIN_CHARACTERS),
  });

/** The delay's sentence, the same for every address (§9 answer 5). */
export const throttledMessage = (minutes: number): string =>
  fillTemplate(uk.kabinet.signIn.throttled, { minutes: String(minutes) });
