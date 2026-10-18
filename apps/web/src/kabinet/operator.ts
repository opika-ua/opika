import { uk } from "@opika/i18n";

type OperatorNameEnv = { KABINET_OPERATOR_DISPLAY_NAME?: string | undefined };

/**
 * Who the operator is to the people reading: `KABINET_OPERATOR_DISPLAY_NAME`
 * (RG-Q8, RS-Q2) in the nominative case, or nothing configured. A union
 * rather than the resolved string, because the fallback is the operator's
 * role itself: a place that also shows the role (the operator's header) has
 * to know it got the fallback, or it says the role twice, and a place that
 * puts the name mid-sentence needs the fallback in lower case. A sentence
 * that needs another case («Написати Олексію») is a catalogue key of its own,
 * never this value declined.
 *
 * Missing or blank is `fallback`: the kabinet never fails to boot over a
 * display name (RS-Q2, Oleksii).
 */
export type OperatorName = { kind: "configured"; name: string } | { kind: "fallback" };

export function operatorNameOf(env: OperatorNameEnv): OperatorName {
  const configured = env.KABINET_OPERATOR_DISPLAY_NAME?.trim();
  return configured ? { kind: "configured", name: configured } : { kind: "fallback" };
}

/**
 * The name standing on its own: both emails' signature line («— {operator}»),
 * the shelter-facing history actor, the operator's header. Unset, the
 * catalogue's capitalised «Адміністратор сайту» (R-UI round 2, answer 6).
 */
export const standaloneOperatorName = (operator: OperatorName): string =>
  operator.kind === "configured" ? operator.name : uk.kabinet.operatorFallbackName;

/**
 * The name inside a sentence: `profile.lockedNote`'s «Ці дані встановлює
 * {operator} під час перевірки». Unset, the role in lower case as answer 9
 * wrote it: a capital mid-sentence would read as a proper name.
 */
export const inSentenceOperatorName = (operator: OperatorName): string =>
  operator.kind === "configured" ? operator.name : uk.kabinet.operatorFallbackNameInSentence;

/** `standaloneOperatorName` straight from the environment: what signs both emails. */
export function operatorDisplayName(env: OperatorNameEnv): string {
  return standaloneOperatorName(operatorNameOf(env));
}
