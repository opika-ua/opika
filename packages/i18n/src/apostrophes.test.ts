import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { en } from "./messages/en";
import { PENDING_R4_2_ANALYTICS_SENTENCE, uk } from "./messages/uk";

/**
 * The Ukrainian apostrophe in the catalogue is U+02BC (ʼ), the character
 * Ukrainian orthography calls for and the one the kabinet copy already used
 * («імʼя», «зʼявляться»). Oleksii, 2026-10-22 (copy audit, row 44), verbatim:
 * "Accept … 44 (all straight apostrophes → ʼ U+02BC)".
 *
 * The cost of a mix is not cosmetic. «з'явитися» and «зʼявитися» stop matching
 * each other in a search, a diff or any future full-text index over
 * shelter-authored text, and the failure is silent in every one of those. The
 * other two look-alikes are what editors and word processors insert on their
 * own: U+0027 (the ASCII fallback) and U+2019 (the typographic quote), so a
 * string pasted in from elsewhere arrives wrong and looks identical in review.
 *
 * Scoped to apostrophes between two letters, so a quoted English word or a
 * possessive in a comment isn't a finding; the catalogue is checked by its
 * values, not its source text, so comments are free.
 */
const MODIFIER_LETTER_APOSTROPHE = String.fromCodePoint(0x02bc);
const LOOK_ALIKES = [String.fromCodePoint(0x0027), String.fromCodePoint(0x2019)] as const;

const CYRILLIC_LETTER = "\\u0400-\\u04FF";
const LOOK_ALIKE_BETWEEN_LETTERS = new RegExp(
  `(?<=[${CYRILLIC_LETTER}])[${LOOK_ALIKES.join("")}](?=[${CYRILLIC_LETTER}])`,
  "u",
);

function leafStrings(value: unknown, path: string): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    leafStrings(child, path ? `${path}.${key}` : key),
  );
}

describe("message catalogue apostrophes", () => {
  const ukValues: [string, string][] = [
    ...leafStrings(uk, ""),
    ["PENDING_R4_2_ANALYTICS_SENTENCE", PENDING_R4_2_ANALYTICS_SENTENCE],
  ];

  it("no Ukrainian value uses U+0027 or U+2019 between letters", () => {
    const offending = ukValues
      .filter(([, text]) => LOOK_ALIKE_BETWEEN_LETTERS.test(text))
      .map(([path]) => path);
    expect(
      offending,
      "These values spell the apostrophe U+0027 or U+2019; use U+02BC (ʼ) like the rest of the catalogue.",
    ).toEqual([]);
  });

  it("no Ukrainian value in the English catalogue either", () => {
    const offending = leafStrings(en, "")
      .filter(([, text]) => LOOK_ALIKE_BETWEEN_LETTERS.test(text))
      .map(([path]) => path);
    expect(offending).toEqual([]);
  });

  it("no seed string a person can read uses U+0027 or U+2019 between letters", () => {
    // The seed is what a demo visitor reads as shelter-authored text, and it
    // is code, not the catalogue, so it is scanned as source: comment lines
    // are free, a string literal is not. Read as text because the seed's
    // module pulls in the database driver, which this package must not.
    const seedSource = readFileSync(new URL("../../db/src/seed.ts", import.meta.url), "utf8");
    const offending = seedSource
      .split("\n")
      .map((line, index): [number, string] => [index + 1, line])
      .filter(([, line]) => !/^\s*(\/\/|\*|\/\*)/u.test(line))
      .filter(([, line]) => LOOK_ALIKE_BETWEEN_LETTERS.test(line))
      .map(([lineNumber]) => `seed.ts:${lineNumber}`);
    expect(offending).toEqual([]);
  });

  it("would fail on either look-alike — the assertion is not vacuous", () => {
    // Guards the guard: a regex typo or a wrong code point would make every
    // assertion above pass against any input at all.
    for (const lookAlike of LOOK_ALIKES) {
      expect(LOOK_ALIKE_BETWEEN_LETTERS.test(`Зв${lookAlike}язатися`)).toBe(true);
    }
    expect(LOOK_ALIKE_BETWEEN_LETTERS.test(`Зв${MODIFIER_LETTER_APOSTROPHE}язатися`)).toBe(false);
    expect(LOOK_ALIKE_BETWEEN_LETTERS.test("Oleksii's")).toBe(false);
  });

  it("confirms the convention it is defending actually exists", () => {
    // If the catalogue ever stopped containing U+02BC entirely, the tests
    // above would still pass while defending nothing.
    expect(uk.reveal.title).toContain(`зв${MODIFIER_LETTER_APOSTROPHE}язатися`);
    expect(
      ukValues.filter(([, text]) => text.includes(MODIFIER_LETTER_APOSTROPHE)).length,
    ).toBeGreaterThan(30);
  });
});
