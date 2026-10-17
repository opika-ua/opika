import { uk } from "@opika/i18n";

/**
 * The name the shelter sees as the actor of the operator's own changes in its
 * history (RG-Q8, RS-Q2): `KABINET_OPERATOR_DISPLAY_NAME`, in the nominative
 * case, used only where the nominative fits (the history actor label). A
 * sentence that needs another case («Написати Олексію») is a catalogue key of
 * its own, never this value declined.
 *
 * Missing or blank, it falls back to the catalogue's «адміністратор сайту». The
 * kabinet never fails to boot over a display name (RS-Q2, Oleksii).
 */
export function operatorDisplayName(env: {
  KABINET_OPERATOR_DISPLAY_NAME?: string | undefined;
}): string {
  const configured = env.KABINET_OPERATOR_DISPLAY_NAME?.trim();
  return configured ? configured : uk.kabinet.operatorFallbackName;
}
