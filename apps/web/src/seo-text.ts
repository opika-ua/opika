/**
 * Trims `text` to at most `maxLength` characters without cutting a word in half, for a
 * meta description built from a shelter's or an animal's own free text (PR B, the SEO
 * review of page titles). Backs up to the last space at or before the limit; if none
 * exists within the limit (one very long word), cuts at the limit itself rather than
 * returning nothing - a description that loses a few trailing characters of one word
 * is still useful, an empty description is not.
 *
 * Never pads a short text up to a minimum - the owner's own instruction for the
 * shelter page ("if it's shorter than 120, leave it short, never pad") is the general
 * rule this function follows everywhere it's used, not a per-page exception.
 */
export function trimAtWordBoundary(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return lastSpace > 0 ? cut.slice(0, lastSpace) : cut;
}
