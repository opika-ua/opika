/** The shared meta-description ceiling (Google's practical limit) - one constant, not a
 * copy in every page that builds one. */
export const META_DESCRIPTION_MAX_LENGTH = 160;

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
 *
 * Three edge cases a first draft of this function got wrong (found on review, each
 * with its own test below):
 * - **Whitespace is normalised first** (runs of newlines/tabs/non-breaking spaces
 *   collapsed to one plain space, then trimmed). Free text typed by a shelter can carry
 *   a literal `\n\n` (`uk.about.data`'s own paragraphs are joined that way elsewhere in
 *   this app) or a non-breaking space, and neither belongs in a one-line meta tag; `\s`
 *   in a JS regex already matches both.
 * - **Counted and cut by Unicode code point, not UTF-16 code unit** (`Array.from`, not
 *   `.slice`) - a plain `.slice` can land inside a surrogate pair (an emoji outside the
 *   BMP) and produce a broken character at the cut point.
 * - **A cut that already lands exactly on a word boundary is kept whole**, rather than
 *   backing up to the *previous* space regardless: `trimAtWordBoundary("abc def ghi", 7)`
 *   is `"abc def"` (the 7th character is the end of "def"), not `"abc"`.
 */
export function trimAtWordBoundary(text: string, maxLength: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (maxLength <= 0) return "";
  const codePoints = Array.from(normalized);
  if (codePoints.length <= maxLength) return normalized;
  const cut = codePoints.slice(0, maxLength);
  if (codePoints[maxLength] === " ") return cut.join("");
  const lastSpaceIndex = cut.lastIndexOf(" ");
  return lastSpaceIndex > 0 ? cut.slice(0, lastSpaceIndex).join("") : cut.join("");
}
