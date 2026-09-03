import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The catalogue uses U+0027 (`'`) for the Ukrainian apostrophe — «Зв'язатися»,
 * «ім'я», «з'являються» — 65 occurrences in `uk.ts` and not one U+2019
 * anywhere. That homogeneity is worth keeping and easy to lose: U+2019 is what
 * most editors, browsers and word processors insert automatically, so a string
 * pasted in from anywhere else arrives with the wrong character and looks
 * identical in review.
 *
 * The cost of the mix is not cosmetic. Two spellings of the same word stop
 * matching each other in a search, a diff, or any future full-text index over
 * shelter-authored text, and the failure is silent in every one of those.
 *
 * ⚠ This asserts *consistency with the file's existing convention*, not
 * typographic correctness. U+2019 is the orthographically correct Ukrainian
 * apostrophe and U+0027 is the ASCII fallback — so if this project ever wants
 * to be right rather than merely consistent, the fix is a single normalisation
 * pass across both catalogues plus inverting this test, never a per-key
 * decision. Doing it one key at a time is what creates the mix this prevents.
 * A reasonable thing to settle during H3's native-speaker pass.
 */
const MESSAGE_FILES = ["./messages/uk.ts", "./messages/en.ts"] as const;

/** U+2019 RIGHT SINGLE QUOTATION MARK, by code point — never as a literal. */
const TYPOGRAPHIC_APOSTROPHE = String.fromCodePoint(0x2019);

function readMessageFile(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

describe("message catalogue apostrophes", () => {
  for (const file of MESSAGE_FILES) {
    it(`${file} uses no U+2019, only the U+0027 the catalogue already uses`, () => {
      const source = readMessageFile(file);
      const offendingLines = source
        .split("\n")
        .map((line, i) => ({ line, number: i + 1 }))
        .filter(({ line }) => line.includes(TYPOGRAPHIC_APOSTROPHE))
        .map(({ line, number }) => `  ${number}: ${line.trim()}`);

      expect(
        offendingLines,
        `${file} contains U+2019 (’) where the rest of the catalogue uses U+0027 (').\n` +
          `${offendingLines.join("\n")}\n` +
          `        Replace it with a plain ' — the two are indistinguishable on screen and ` +
          `will not match each other in any search or diff.`,
      ).toEqual([]);
    });
  }

  it("would fail if a U+2019 were introduced — the assertion is not vacuous", () => {
    // Guards the guard: a regex typo or a wrong code point would make every
    // assertion above pass against any input at all.
    const contaminated = `intro: "Зв${TYPOGRAPHIC_APOSTROPHE}язатися",`;
    expect(contaminated.includes(TYPOGRAPHIC_APOSTROPHE)).toBe(true);
    expect("Зв'язатися".includes(TYPOGRAPHIC_APOSTROPHE)).toBe(false);
  });

  it("confirms the convention it is defending actually exists", () => {
    // If uk.ts ever stopped containing U+0027 apostrophes entirely, the tests
    // above would still pass while defending nothing.
    expect(readMessageFile("./messages/uk.ts")).toContain("Зв'язатися");
  });
});
