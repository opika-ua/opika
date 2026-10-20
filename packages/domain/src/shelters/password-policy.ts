import { characterCount } from "./freshness-sentence";

/**
 * A shelter admin's password (`docs/shelter-passwords.md` §3; Oleksii's scope
 * item 4, verbatim: "Password policy (NIST 800-63B): min 10, max 128
 * characters, no composition rules, reject passwords on a bundled
 * common/breached list (local, no third-party calls), hint while typing.").
 *
 * NIST 800-63B §5.1.1.2 asks for a length floor, a generous ceiling, no
 * composition rules (no "one digit, one capital"), and a check against values
 * known to be common or compromised. Composition rules push people towards
 * `Password1!`, which every guessing list tries early; length and the list are
 * what actually raise the cost of a guess.
 *
 * Lengths are counted as a reader counts characters (`characterCount`), the
 * same rule as the display-name and animal-name caps, so a flag or a family
 * emoji is one character and the hint while typing can agree with the server.
 */
export const PASSWORD_MIN_CHARACTERS = 10;
export const PASSWORD_MAX_CHARACTERS = 128;

/**
 * The shortest personal part that is checked. Oleksii's §9 answer 2 asks to
 * reject passwords containing the email's local part, the shelter's name or
 * the site's name, case-insensitively (his words, with the site's name in
 * them, are in `docs/shelter-passwords.md` §9). Read literally, an address
 * like `a@…` would forbid every password containing the letter «a»; below
 * three characters a part says nothing about the person, and refusing on it
 * would only refuse good passwords. (A builder's threshold, recorded under
 * "Decisions taken", not his number.)
 */
export const PERSONAL_PART_MIN_CHARACTERS = 3;

/**
 * Why a password is refused, or that it isn't. One reason at a time, checked
 * in this order: the two lengths (which need no lookup), then the personal
 * parts, then the common list. The live hint shows only the length; the other
 * two come back on submit (§9 answer 2: "the live hint shows length; "too
 * common" on submit").
 */
export type PasswordVerdict =
  | { readonly kind: "ok" }
  | { readonly kind: "too_short"; readonly min: number }
  | { readonly kind: "too_long"; readonly max: number }
  /** Contains the email's local part, the shelter's name or the site's name. */
  | { readonly kind: "contains_personal" }
  /** On the bundled list of common passwords. */
  | { readonly kind: "common" };

/**
 * The bundled list, asked about one whole password at a time. Passed in, not
 * imported: the list is server-only data (`apps/web`), while this module also
 * ships to browsers that only count characters.
 */
export interface CommonPasswordList {
  /** Whether `folded` (the whole password, folded as `foldForComparison` folds it) is on the list. */
  has(folded: string): boolean;
}

/**
 * Who the password is for, and the site's own name. The site's name comes from
 * the app's config, never from this package: the product's name is not final
 * and stays out of `packages/domain` (CLAUDE.md, "the name is not final").
 */
export type PasswordSubject = {
  readonly email: string;
  readonly shelterName: string;
  readonly siteName: string;
};

/**
 * Case-insensitive, and blind to the compatibility forms a keyboard can
 * produce (fullwidth Latin, ligatures): NFKC, then lower case. Applied to the
 * password and to everything it is compared with.
 */
export const foldForComparison = (text: string): string => text.normalize("NFKC").toLowerCase();

/** «Притулок «Сіріус»» → «Сіріус»: the quoted part is usually the name people use. */
const QUOTED = /[«"„“]([^«»"„“”]+)[»"“”]/gu;

/**
 * The parts a password may not contain, folded: the email's local part, the
 * shelter's name as written (whitespace collapsed), any part of the name in
 * quotes, and the site's name. Parts shorter than PERSONAL_PART_MIN_CHARACTERS
 * are dropped.
 */
export function personalPartsOf(subject: PasswordSubject): string[] {
  const at = subject.email.lastIndexOf("@");
  const localPart = at > 0 ? subject.email.slice(0, at) : subject.email;
  const name = subject.shelterName.trim().replace(/\s+/gu, " ");
  const quoted = [...name.matchAll(QUOTED)].map((match) => (match[1] ?? "").trim());
  return [localPart, name, ...quoted, subject.siteName]
    .map(foldForComparison)
    .filter((part) => characterCount(part) >= PERSONAL_PART_MIN_CHARACTERS);
}

/**
 * The verdict on a password a shelter admin is setting (a reset, a change;
 * from PW-2 also the invitation). The server runs it on every write path;
 * Better Auth's own `minPasswordLength`/`maxPasswordLength` stay set beneath
 * it as a second line (§3).
 *
 * The password is never trimmed: spaces are characters a person chose
 * (NIST 800-63B allows them), and a trim here would let the stored hash differ
 * from what was typed.
 */
export function passwordVerdictOf(
  password: string,
  subject: PasswordSubject,
  commonPasswords: CommonPasswordList,
): PasswordVerdict {
  const characters = characterCount(password);
  if (characters < PASSWORD_MIN_CHARACTERS) {
    return { kind: "too_short", min: PASSWORD_MIN_CHARACTERS };
  }
  if (characters > PASSWORD_MAX_CHARACTERS) {
    return { kind: "too_long", max: PASSWORD_MAX_CHARACTERS };
  }
  const folded = foldForComparison(password);
  if (personalPartsOf(subject).some((part) => folded.includes(part))) {
    return { kind: "contains_personal" };
  }
  if (commonPasswords.has(folded)) return { kind: "common" };
  return { kind: "ok" };
}
