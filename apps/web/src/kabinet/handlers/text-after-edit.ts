import type { LocalizedText } from "@opika/domain";

/**
 * The text an edit stores: the description, the medical note, or a custom
 * temperament or colour (decision taken T5, by analogy with Oleksii's K4-B1
 * answer 13 for the shelter's sentence, verbatim: "Clear `en` when `uk`
 * changes; a stale translation would be a false claim."). A changed Ukrainian
 * text stores no English, whatever the request carried; an unchanged one
 * keeps the English sent with it.
 */
export function textAfterEdit(stored: LocalizedText | null, edited: LocalizedText): LocalizedText {
  if (stored !== null && stored.uk === edited.uk) return edited;
  return { uk: edited.uk, en: null };
}

/** `textAfterEdit` for a text that can be cleared: null in is null out. */
export function optionalTextAfterEdit(
  stored: LocalizedText | null,
  edited: LocalizedText | null,
): LocalizedText | null {
  return edited === null ? null : textAfterEdit(stored, edited);
}
