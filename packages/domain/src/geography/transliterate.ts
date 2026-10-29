/**
 * Ukrainian to Latin, KMU resolution No 55 (2010) ("passport" transliteration).
 * Used only for the stored search key `cities.search_latin`, never for a URL: slugs come
 * from the human-reviewed English name (`city-slug.ts`).
 */

const PLAIN: Readonly<Record<string, string>> = {
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
};

/** The letters whose Latin form depends on word position: [word-initial, elsewhere]. */
const POSITIONAL: Readonly<Record<string, readonly [string, string]>> = {
  є: ["ye", "ie"],
  ї: ["yi", "i"],
  й: ["y", "i"],
  ю: ["yu", "iu"],
  я: ["ya", "ia"],
};

/** Dropped, and not a word boundary: "Камʼянка" is "Kamianka", not "Kamyanka". */
const APOSTROPHE = /[\u{02BC}'\u{2019}\u{2018}`\u{02B9}]/u;
const CYRILLIC_LETTER = /[\u{0400}-\u{04FF}]/u;

export function transliterateUk(text: string): string {
  const lower = text.toLocaleLowerCase("uk");
  let out = "";
  let atWordStart = true;
  for (let i = 0; i < lower.length; i++) {
    const ch = lower.charAt(i);
    // "зг" is "zgh" so that it is not read as the digraph "zh".
    if (ch === "з" && lower.charAt(i + 1) === "г") {
      out += "zgh";
      i++;
      atWordStart = false;
      continue;
    }
    const positional = POSITIONAL[ch];
    if (positional !== undefined) {
      out += atWordStart ? positional[0] : positional[1];
      atWordStart = false;
      continue;
    }
    const plain = PLAIN[ch];
    if (plain !== undefined) {
      out += plain;
      atWordStart = false;
      continue;
    }
    if (APOSTROPHE.test(ch)) continue;
    out += ch;
    atWordStart = !CYRILLIC_LETTER.test(ch) && !/[a-z0-9]/.test(ch);
  }
  return out;
}
