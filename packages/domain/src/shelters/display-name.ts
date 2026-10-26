import { z } from "zod";
import { characterCount } from "./freshness-sentence";

/**
 * RUI4-F2: the cap on a shelter's display name as new input takes it (his
 * answer, verbatim: "RUI4-F2: 100-char cap approved. Input-side only (create +
 * rename forms and their procedures); reads must never fail on an existing
 * longer name."). Counted as a reader counts characters (`characterCount`),
 * after trimming, like the animal's name and the notes.
 *
 * Why 100: the name is how the shelter calls itself, and it is printed whole
 * on the cards, the animal page, the reveal, the kabinet's heading, the
 * invitation email and the rename history line (which holds two of them).
 * A self-name that spells out a legal form, a quoted name and a council or
 * oblast runs to about 60-80 characters; 100 keeps such a name whole and
 * still bounds every one of those lines. A name written in letters also
 * stays under the S1 search's 200 (UTF-16 units), so it can be searched for
 * in full; one built from multi-part emoji (a family is 8 units) may not.
 *
 * Only input carries it: `ShelterSchema.displayName`, which every view picks
 * from, stays as it was, so a stored name over the cap is still served.
 */
export const SHELTER_DISPLAY_NAME_MAX_CHARACTERS = 100;

/**
 * The refusal's issue message. Stable, so the operator's forms can tell this
 * refusal from any other 400 and put the name's own sentence on the field;
 * it is never shown to anyone.
 */
export const SHELTER_DISPLAY_NAME_TOO_LONG_MESSAGE = `Shelter display name is longer than ${SHELTER_DISPLAY_NAME_MAX_CHARACTERS} characters`;

/** Over the cap once the surrounding spaces, which are never stored, are gone. */
export const isShelterDisplayNameTooLong = (name: string): boolean =>
  characterCount(name.trim()) > SHELTER_DISPLAY_NAME_MAX_CHARACTERS;

/**
 * The display name as a write takes it: trimmed, then required, then at most
 * `SHELTER_DISPLAY_NAME_MAX_CHARACTERS`. Shared by `registry.shelters.create`
 * and `registry.shelters.updateProfile`, so a name one accepts the other does.
 */
export const ShelterDisplayNameInputSchema = z
  .string()
  .trim()
  .min(1)
  .refine((name) => !isShelterDisplayNameTooLong(name), {
    message: SHELTER_DISPLAY_NAME_TOO_LONG_MESSAGE,
  });
