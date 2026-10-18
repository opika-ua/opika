import {
  SHELTER_DISPLAY_NAME_MAX_CHARACTERS,
  SHELTER_DISPLAY_NAME_TOO_LONG_MESSAGE,
} from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";

/**
 * RUI4-F2 on the operator's two name fields (S2's «Назва притулку» and S4's
 * rename). Both check the cap before sending and say so on the field rather
 * than stopping the typing with `maxLength`, which would cut a pasted name
 * short without a word; the server checks it again with the same rule.
 */

const integer = new Intl.NumberFormat("uk");

/** His sentence, «Назва довша за 100 символів.», filled from the shared cap. */
export const nameTooLongMessage = (): string =>
  fillTemplate(uk.kabinet.operator.create.errors.nameTooLong, {
    max: integer.format(SHELTER_DISPLAY_NAME_MAX_CHARACTERS),
  });

/**
 * Whether a refusal is the server's input check turning the name down for
 * its length: oRPC answers a failed input check with BAD_REQUEST and the
 * schema's issues as its data, and only the display name's rule carries this
 * message. Reached when the server counts a name longer than the page did
 * (a browser segmenting an emoji differently, a page older than the cap).
 */
export function refusedForNameLength(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, data } = error as { code?: unknown; data?: unknown };
  if (code !== "BAD_REQUEST" || typeof data !== "object" || data === null) return false;
  const { issues } = data as { issues?: unknown };
  return (
    Array.isArray(issues) &&
    issues.some(
      (issue: unknown) =>
        typeof issue === "object" &&
        issue !== null &&
        (issue as { message?: unknown }).message === SHELTER_DISPLAY_NAME_TOO_LONG_MESSAGE,
    )
  );
}
