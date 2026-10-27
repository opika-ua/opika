const FIRST_LETTER = /[A-Za-zА-ЩЬЮЯЄІЇҐа-щьюяєіїґ]/;

/**
 * The fallback-initials avatar's own text, when a shelter has no logo (pet
 * card PR 3b §C, "a 40px circle in line-colour with the shelter's
 * initials"): the first letter of each of the first two words, uppercase.
 * Skips leading punctuation per word (a name quoted like «Домівка» starts
 * with a guillemet, not a letter), so the initial is always a real
 * character, never empty or a quote mark.
 */
export function shelterInitialsOf(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((word) => word.match(FIRST_LETTER)?.[0]?.toUpperCase() ?? "")
    .join("");
}
