import { z } from "zod";

/**
 * A public, human-readable identifier for a city — `brovary`, not
 * `c1000000-0000-4000-8000-000000000001` (`docs/observations.md`'s O-6).
 * Lowercase ASCII words joined by single hyphens: the only shape a URL query
 * value and a search engine both read as a place name rather than an opaque
 * token.
 */
export const CitySlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  .brand<"CitySlug">();
export type CitySlug = z.infer<typeof CitySlugSchema>;

/**
 * The Ukrainian National transliteration system (Резолюція КМУ №55,
 * 27.01.2010) — the same table Ukraine's own passport and road-sign
 * romanization uses, which is why it reproduces already-familiar spellings
 * for real places (`Київ` → `Kyiv`, `Бориспіль` → `Boryspil`) rather than an
 * invented scheme. Five letters (`є ї й ю я`) transliterate differently at
 * the start of a word than in the middle of one; every other letter is
 * position-independent — except the digraph handled separately below.
 */
const LETTER: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "h",
  ґ: "g",
  д: "d",
  е: "e",
  ж: "zh",
  з: "z",
  и: "y",
  і: "i",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ь: "",
  "'": "",
  "’": "",
};

const WORD_INITIAL: Record<string, string> = {
  є: "ye",
  ї: "yi",
  й: "y",
  ю: "yu",
  я: "ya",
};

const MID_WORD: Record<string, string> = {
  є: "ie",
  ї: "i",
  й: "i",
  ю: "iu",
  я: "ia",
};

/**
 * Note 2 of the same resolution: `зг` renders `zgh`, not `z`+`h` — reserving
 * plain `zh` exclusively for `ж`, so `Згурівка` (a real Kyiv-oblast raion
 * centre) romanizes `zghurivka`, never `zhurivka`, which would be
 * indistinguishable from a name that actually contained `ж`. Checked before
 * the single-letter table below, and consumes both characters at once.
 */
const ZH_DIGRAPH_SOURCE = "зг";
const ZH_DIGRAPH_TARGET = "zgh";

function transliterateWord(word: string): string {
  let result = "";
  let i = 0;
  while (i < word.length) {
    if (word.slice(i, i + 2) === ZH_DIGRAPH_SOURCE) {
      result += ZH_DIGRAPH_TARGET;
      i += 2;
      continue;
    }
    const ch = word[i] ?? "";
    if (i === 0 && ch in WORD_INITIAL) {
      result += WORD_INITIAL[ch];
    } else if (ch in MID_WORD) {
      result += MID_WORD[ch];
    } else if (ch in LETTER) {
      result += LETTER[ch];
    } else if (/[a-z0-9]/.test(ch)) {
      result += ch;
    }
    // Anything else — punctuation, marks, a script this table doesn't cover
    // — is dropped, not passed through: a stray "." or "(" would otherwise
    // survive into the attempted slug and fail `CitySlugSchema`'s regex.
    i += 1;
  }
  return result;
}

/**
 * Not total: a name that transliterates to nothing at all (empty, or purely
 * punctuation/marks this table doesn't cover) throws via `CitySlugSchema`'s
 * own parse, same as any other genuinely invalid input this codebase
 * validates at a boundary. A city name normally reaches this function as
 * curated content (a moderator or `seed.ts`), not raw user input, so this is
 * the same posture as everywhere else that trusts its own domain data — it
 * is not, however, guaranteed to succeed on every string, and callers should
 * not assume it is. Splitting on whitespace/hyphen, not apostrophe, is
 * deliberate: the apostrophe itself transliterates to nothing (`LETTER`,
 * above), so `Кам'янець` walks as one word and produces `kamianets` — the
 * same word-initial-vs-mid-word rule the standard applies to any interior
 * `я`.
 */
export function citySlugOf(nameUk: string): CitySlug {
  const slug = nameUk
    .toLowerCase()
    .split(/[\s-]+/)
    .map(transliterateWord)
    .filter((word) => word.length > 0)
    .join("-");
  return CitySlugSchema.parse(slug);
}
