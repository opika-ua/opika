import type { KabinetShelterView } from "@opika/contracts";
import {
  CONTACT_TOO_MANY_CHANNELS_MESSAGE,
  SHELTER_DESCRIPTION_TOO_LONG_MESSAGE,
} from "@opika/domain";

/**
 * What a K4 write came back as, in the terms the screen speaks: the new view,
 * or which of Oleksii's messages applies.
 *
 * - `conflict`: CONFLICT (409), someone saved first; the section offers the
 *   current version (`errors.conflict`).
 * - `illegal_transition`: ILLEGAL_TRANSITION (409) on pause or resume.
 * - `no_answer`: no response at all (the connection dropped, a timeout). The
 *   server may have saved it anyway, so a form section reads the profile
 *   again before saying anything (inbox K4-T16, Oleksii: "fine"): the saved
 *   value there means «Збережено.», anything else `state.failed`.
 * - `too_many_channels`: the input check refused a contact over the channel cap; the contacts
 *   section says which rule and how to fix it.
 * - `description_too_long`: the same, for the shelter's text over its cap (`SHELTER_DESCRIPTION_TOO_LONG_MESSAGE`).
 * - `failed`: the server answered with any other refusal.
 */
export type WriteResult =
  | { kind: "ok"; view: KabinetShelterView }
  | { kind: "conflict" }
  | { kind: "too_many_channels" }
  | { kind: "description_too_long" }
  | { kind: "illegal_transition" }
  | { kind: "no_answer" }
  | { kind: "failed" };

export type WriteFailure = Exclude<WriteResult, { kind: "ok" }>;

/** oRPC answers a failed input check with BAD_REQUEST and the schema's issues as its data. */
const hasIssueMessage = (error: unknown, message: string): boolean => {
  const data = (error as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return false;
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
};

const codeOf = (error: unknown): string | null =>
  typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : null;

export function writeFailureOf(error: unknown): WriteFailure {
  switch (codeOf(error)) {
    case "CONFLICT":
      return { kind: "conflict" };
    case "ILLEGAL_TRANSITION":
      return { kind: "illegal_transition" };
    case null:
      // No error code: no answer from the server reached us (fetch threw).
      return { kind: "no_answer" };
    case "BAD_REQUEST":
      if (hasIssueMessage(error, CONTACT_TOO_MANY_CHANNELS_MESSAGE)) {
        return { kind: "too_many_channels" };
      }
      return hasIssueMessage(error, SHELTER_DESCRIPTION_TOO_LONG_MESSAGE)
        ? { kind: "description_too_long" }
        : { kind: "failed" };
    default:
      return { kind: "failed" };
  }
}

export async function runWrite(call: () => Promise<KabinetShelterView>): Promise<WriteResult> {
  try {
    return { kind: "ok", view: await call() };
  } catch (error) {
    return writeFailureOf(error);
  }
}

/**
 * Whether two stored values are the same, whatever order their keys came
 * back in (Postgres `jsonb` reorders object keys). For deciding whether a
 * save whose answer was lost actually landed.
 */
export function sameStoredValue(a: unknown, b: unknown): boolean {
  const canonical = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(canonical)
      : value !== null && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
              .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
              .map(([key, child]) => [key, canonical(child)]),
          )
        : value;
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
