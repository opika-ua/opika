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
 * Whether a refusal is the server's input check turning a field down with this fixed message:
 * oRPC answers a failed input check with BAD_REQUEST and the schema's issues as its data. Shared by
 * the two operator fields with a cap whose editor says it on the field.
 */
export function refusedWithIssueMessage(error: unknown, message: string): boolean {
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
        (issue as { message?: unknown }).message === message,
    )
  );
}

/**
 * Whether a refusal is the display name's cap, only that rule carries this message. Reached when
 * the server counts a name longer than the page did (a browser segmenting an emoji differently, a
 * page older than the cap).
 */
export const refusedForNameLength = (error: unknown): boolean =>
  refusedWithIssueMessage(error, SHELTER_DISPLAY_NAME_TOO_LONG_MESSAGE);
