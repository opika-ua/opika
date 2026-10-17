import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ANIMAL_NAME_TOKEN,
  AnimalNameInputSchema,
  animalNameProblem,
  characterCount,
  fillAnimalName,
  normalizeFreshnessSentenceText,
} from "./freshness-sentence";

/** The canonical token; its apostrophe is pinned by code point below, since the glyphs look alike. */
const TOKEN = "{імʼя}";

describe("ANIMAL_NAME_TOKEN", () => {
  it("is {імʼя} with U+02BC MODIFIER LETTER APOSTROPHE", () => {
    expect(ANIMAL_NAME_TOKEN).toBe(TOKEN);
    expect([...ANIMAL_NAME_TOKEN].map((c) => c.codePointAt(0))).toEqual([
      0x7b, 0x456, 0x43c, 0x2bc, 0x44f, 0x7d,
    ]);
  });
});

describe("characterCount", () => {
  it.each([
    ["Cyrillic letters", "Мурчик", 6],
    ["an emoji with a skin-tone modifier", "👋🏽", 1],
    ["a ZWJ family emoji", "👨‍👩‍👧", 1],
    ["a flag", "🇺🇦", 1],
    ["a letter plus a combining acute accent", "е́", 1],
    ["mixed text", "Пес 🐾!", 6],
    ["the token", TOKEN, 6],
  ])("counts %s as a person would", (_label, text, expected) => {
    expect(characterCount(text)).toBe(expected);
  });
});

/**
 * Review finding 3: a browser without `Intl.Segmenter` (Firefox < 125) must
 * be able to load this module, which ships in client bundles, and still get
 * a count. The module is re-imported with the global stubbed, so a segmenter
 * built at load time would throw inside the import itself.
 */
describe("characterCount without Intl.Segmenter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("loads, and counts code points instead of throwing", async () => {
    vi.stubGlobal("Intl", { ...Intl, Segmenter: undefined });
    vi.resetModules();
    const fallback = await import("./freshness-sentence");
    // Code points, not UTF-16 units: «🐾» is one, though its String.length is 2.
    expect(fallback.characterCount("Пес 🐾!")).toBe(6);
    // Stricter than graphemes, never looser: a skin-tone emoji is two code points.
    expect(fallback.characterCount("👋🏽")).toBe(2);
  });
});

describe("normalizeFreshnessSentenceText", () => {
  const ok = (text: string) => ({ kind: "ok", text });

  it("trims and keeps plain text as written", () => {
    expect(normalizeFreshnessSentenceText("  Оновлюємо щотижня.\n")).toEqual(
      ok("Оновлюємо щотижня."),
    );
  });

  it.each([
    ["empty", ""],
    ["whitespace only", "  \n\t "],
  ])("is empty for %s", (_label, raw) => {
    expect(normalizeFreshnessSentenceText(raw)).toEqual({ kind: "empty" });
  });

  it.each([
    ["ASCII apostrophe", "{ім'я}"],
    ["right single quotation mark", "{ім’я}"],
    ["left single quotation mark", "{ім‘я}"],
    ["modifier letter apostrophe", "{імʼя}"],
    ["modifier letter turned comma", "{імʻя}"],
    ["backtick", "{ім`я}"],
    ["capitalised", "{Ім'я}"],
    ["upper case", "{ІМ’Я}"],
    ["mixed case", "{іМʼя}"],
  ])("normalises the token spelled with %s to {імʼя}", (_label, spelling) => {
    expect(normalizeFreshnessSentenceText(`Напишіть, чи ${spelling} ще з нами.`)).toEqual(
      ok(`Напишіть, чи ${TOKEN} ще з нами.`),
    );
  });

  it("normalises every occurrence, not just the first", () => {
    expect(normalizeFreshnessSentenceText("{ім'я} чекає. {ІМ’Я} справді чекає.")).toEqual(
      ok(`${TOKEN} чекає. ${TOKEN} справді чекає.`),
    );
  });

  it.each([
    ["{дата}", "Оновлено {дата}.", "{дата}"],
    ["{name}", "Пишіть про {name}.", "{name}"],
    ["empty braces", "Пишіть {}.", "{}"],
    ["spaces inside the token", "Чи { ім'я } тут?", "{ ім'я }"],
    ["a Latin i in the token", "Чи {im'я} тут?", "{im'я}"],
    ["an unknown token after a valid one", `${TOKEN} оновлено {дата}`, "{дата}"],
  ])("refuses %s as an unknown token", (_label, raw, token) => {
    expect(normalizeFreshnessSentenceText(raw)).toEqual({
      kind: "invalid",
      problem: { kind: "unknown_token", token },
    });
  });

  it.each([
    ["a stray closing brace", "Оновлюємо } щотижня."],
    ["a stray opening brace", "Оновлюємо { щотижня."],
    ["braces wrapped around the token", `{ab${TOKEN}cd`],
    ["an unclosed brace before the token", `{ ${TOKEN}`],
  ])("refuses %s", (_label, raw) => {
    expect(normalizeFreshnessSentenceText(raw)).toEqual({
      kind: "invalid",
      problem: { kind: "stray_brace" },
    });
  });

  it("accepts exactly 280 characters and refuses 281", () => {
    expect(normalizeFreshnessSentenceText("я".repeat(280))).toEqual(ok("я".repeat(280)));
    expect(normalizeFreshnessSentenceText("я".repeat(281))).toEqual({
      kind: "invalid",
      problem: { kind: "too_long", characters: 281, max: 280 },
    });
  });

  it("counts emoji as one character each, not by UTF-16 units", () => {
    // 280 paw prints are 560 UTF-16 units.
    expect(normalizeFreshnessSentenceText("🐾".repeat(280)).kind).toBe("ok");
    expect(normalizeFreshnessSentenceText("🐾".repeat(281))).toEqual({
      kind: "invalid",
      problem: { kind: "too_long", characters: 281, max: 280 },
    });
  });

  it("measures after trimming", () => {
    expect(normalizeFreshnessSentenceText(`   ${"я".repeat(280)}   `).kind).toBe("ok");
  });

  it("measures after normalising the token", () => {
    // Each token is 6 characters whatever its apostrophe: 274 + 6 = 280.
    expect(normalizeFreshnessSentenceText(`${"я".repeat(274)}{ім'я}`).kind).toBe("ok");
    expect(normalizeFreshnessSentenceText(`${"я".repeat(275)}{ім'я}`)).toEqual({
      kind: "invalid",
      problem: { kind: "too_long", characters: 281, max: 280 },
    });
  });
});

describe("fillAnimalName", () => {
  it("replaces every token with the name", () => {
    expect(fillAnimalName(`Чи ${TOKEN} ще з нами? ${TOKEN} чекає.`, "Мурчик")).toBe(
      "Чи Мурчик ще з нами? Мурчик чекає.",
    );
  });

  it("leaves a sentence without the token untouched", () => {
    expect(fillAnimalName("Оновлюємо щотижня.", "Мурчик")).toBe("Оновлюємо щотижня.");
  });

  it("inserts the name literally, even where it looks like a replacement pattern", () => {
    expect(fillAnimalName(`Чи ${TOKEN} тут?`, "Пес $& $1 $$")).toBe("Чи Пес $& $1 $$ тут?");
  });

  it("does not fill an un-normalised spelling: storage only ever holds {імʼя}", () => {
    expect(fillAnimalName("Чи {ім'я} тут?", "Мурчик")).toBe("Чи {ім'я} тут?");
  });
});

describe("animalNameProblem", () => {
  it("accepts an ordinary name", () => {
    expect(animalNameProblem("Мурчик")).toBeNull();
  });

  it.each([["{імʼя}"], ["Бу{"], ["}"], ["{name}"]])("refuses %s, which has a brace", (name) => {
    expect(animalNameProblem(name)).toEqual({ kind: "brace" });
  });

  it("refuses an empty or whitespace-only name", () => {
    expect(animalNameProblem("   ")).toEqual({ kind: "empty" });
  });

  it("accepts exactly 60 characters and refuses 61, measured after trimming", () => {
    expect(animalNameProblem(` ${"я".repeat(60)} `)).toBeNull();
    expect(animalNameProblem("я".repeat(61))).toEqual({
      kind: "too_long",
      characters: 61,
      max: 60,
    });
  });

  it("counts an emoji as one character", () => {
    expect(animalNameProblem("🐾".repeat(60))).toBeNull();
  });
});

describe("AnimalNameInputSchema", () => {
  it("trims the name it accepts", () => {
    expect(AnimalNameInputSchema.parse("  Мурчик ")).toBe("Мурчик");
  });

  it.each([["{імʼя}"], [""], ["я".repeat(61)]])("refuses %s", (name) => {
    expect(AnimalNameInputSchema.safeParse(name).success).toBe(false);
  });
});
