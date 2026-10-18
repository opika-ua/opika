import { describe, expect, it } from "vitest";
import {
  AnimalPatchSchema,
  FreshnessSentenceInputSchema,
  PAUSE_NOTE_MAX_CHARACTERS,
  PauseReasonInputSchema,
  registrySheltersContract,
  shelterAnimalsContract,
  shelterProfileContract,
} from "./procedures";

/** The canonical token, with U+02BC (pinned by code point in the domain's own test). */
const TOKEN = "{імʼя}";

type Parser = {
  readonly safeParse: (value: unknown) => {
    success: boolean;
    data?: unknown;
    error?: { issues: readonly { message: string; path: readonly PropertyKey[] }[] };
  };
};
type WithInput = { readonly "~orpc": { readonly inputSchema?: unknown } };

const inputOf = (procedure: WithInput): Parser => procedure["~orpc"].inputSchema as Parser;
const fieldOf = (procedure: WithInput, field: string): Parser =>
  (procedure["~orpc"].inputSchema as { shape: Record<string, Parser> }).shape[field] as Parser;

/** Every write that accepts a freshness sentence, checked through its own declared input. */
const freshnessFields: readonly [string, Parser][] = [
  [
    "shelter.profile.updateFreshnessSentence",
    fieldOf(shelterProfileContract.updateFreshnessSentence, "freshnessSentence"),
  ],
  ["registry.shelters.create", fieldOf(registrySheltersContract.create, "freshnessSentence")],
  [
    "registry.shelters.updateProfile",
    fieldOf(registrySheltersContract.updateProfile, "freshnessSentence"),
  ],
];

describe.each(freshnessFields)("%s freshnessSentence", (_path, field) => {
  it("normalises the token spellings to {імʼя}", () => {
    expect(field.safeParse({ uk: "  Чи {Ім'я} ще з нами?  ", en: null })).toMatchObject({
      success: true,
      data: { uk: `Чи ${TOKEN} ще з нами?`, en: null },
    });
  });

  it("normalises the English text too", () => {
    expect(
      field.safeParse({
        uk: "Оновлюємо щотижня.",
        en: { text: "Is {ім’я} still here?", provenance: "human" },
      }),
    ).toMatchObject({
      success: true,
      data: { en: { text: `Is ${TOKEN} still here?`, provenance: "human" } },
    });
  });

  it.each([
    ["an unknown token", { uk: "Оновлено {дата}.", en: null }, "{дата}"],
    ["a stray brace", { uk: "Оновлено }.", en: null }, "brace"],
    ["281 characters", { uk: "я".repeat(281), en: null }, "281"],
    [
      "an English text with an unknown token",
      { uk: "Оновлюємо.", en: { text: "Updated {date}.", provenance: "machine" } },
      "{date}",
    ],
  ])("refuses %s", (_label, value, inMessage) => {
    const result = field.safeParse(value);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain(inMessage);
  });

  it("accepts 280 characters", () => {
    expect(field.safeParse({ uk: "я".repeat(280), en: null }).success).toBe(true);
  });

  it("clears the sentence when the Ukrainian is blank", () => {
    expect(field.safeParse({ uk: "   ", en: null })).toMatchObject({ success: true, data: null });
    expect(field.safeParse(null)).toMatchObject({ success: true, data: null });
  });

  it("drops a blank English translation", () => {
    expect(
      field.safeParse({ uk: "Оновлюємо.", en: { text: " ", provenance: "human" } }),
    ).toMatchObject({ success: true, data: { uk: "Оновлюємо.", en: null } });
  });

  it("refuses an English text whose Ukrainian is blank, rather than throwing it away", () => {
    const result = field.safeParse({
      uk: "",
      en: { text: "Updated weekly.", provenance: "human" },
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["uk"]);
  });
});

describe("updateFreshnessSentence's whole input", () => {
  it("hands the handler the normalised text", () => {
    expect(
      inputOf(shelterProfileContract.updateFreshnessSentence).safeParse({
        freshnessSentence: { uk: "{ІМ`Я} чекає.", en: null },
        expectedVersion: 3,
      }),
    ).toEqual({
      success: true,
      data: { freshnessSentence: { uk: `${TOKEN} чекає.`, en: null }, expectedVersion: 3 },
    });
  });
});

describe("FreshnessSentenceInputSchema", () => {
  it("is what the three writes use", () => {
    for (const [, field] of freshnessFields) {
      // updateProfile wraps it in .optional(), so compare behaviour, not identity.
      expect(field.safeParse({ uk: "{дата}", en: null }).success).toBe(false);
    }
    expect(FreshnessSentenceInputSchema.safeParse({ uk: "{дата}", en: null }).success).toBe(false);
  });
});

/**
 * R-UI 4: a rename is checked by create's own rule for the display name, so
 * the two can't drift apart (a name S2 refuses can't arrive by rename).
 * Compared by behaviour: updateProfile wraps the rule in .optional().
 */
const displayNameFields: readonly [string, Parser][] = [
  ["registry.shelters.create", fieldOf(registrySheltersContract.create, "displayName")],
  [
    "registry.shelters.updateProfile",
    fieldOf(registrySheltersContract.updateProfile, "displayName"),
  ],
];

describe.each(displayNameFields)("%s displayName", (_path, field) => {
  it("trims the ends and keeps the inside as typed", () => {
    expect(field.safeParse("  Притулок «Лапа  допомоги» ")).toMatchObject({
      success: true,
      data: "Притулок «Лапа  допомоги»",
    });
  });

  it.each([
    ["an empty name", ""],
    ["a blank name", " \t\n "],
    ["a number", 42],
    ["null", null],
  ])("refuses %s", (_label, value) => {
    expect(field.safeParse(value).success).toBe(false);
  });
});

describe("registry.shelters.updateProfile's whole input", () => {
  const ref = { shelterId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", expectedVersion: 2 };

  it("takes a rename on its own, handing the handler the trimmed name", () => {
    expect(
      inputOf(registrySheltersContract.updateProfile).safeParse({
        ...ref,
        displayName: " Лапа допомоги ",
      }),
    ).toMatchObject({ success: true, data: { ...ref, displayName: "Лапа допомоги" } });
  });

  it("still refuses a call that changes nothing", () => {
    expect(inputOf(registrySheltersContract.updateProfile).safeParse(ref).success).toBe(false);
  });
});

const description = (uk: string, en: string | null = null) => ({
  uk,
  en: en === null ? null : { text: en, provenance: "machine" },
});

/** createDraft takes a name and a species only (K-Q5), so the description cases run on the patch. */
const nameFields: readonly [string, Parser][] = [
  ["shelter.animals.createDraft", fieldOf(shelterAnimalsContract.createDraft, "name")],
  ["AnimalPatchSchema (shelter.animals.update)", AnimalPatchSchema.shape.name.unwrap()],
];

describe.each(nameFields)("%s", (_path, name) => {
  it("trims the name", () => {
    expect(name.safeParse("  Мурчик ")).toMatchObject({ success: true, data: "Мурчик" });
  });

  it.each([
    ["a name carrying the token", TOKEN],
    ["a brace", "Бу}"],
    ["a blank name", "   "],
    ["61 characters", "я".repeat(61)],
  ])("refuses %s", (_label, value) => {
    expect(name.safeParse(value).success).toBe(false);
  });

  it("accepts a 60-character name", () => {
    expect(name.safeParse("я".repeat(60)).success).toBe(true);
  });
});

describe("AnimalPatchSchema's description (shelter.animals.update)", () => {
  const desc: Parser = AnimalPatchSchema.shape.description.unwrap();

  it("accepts a 1,500-character description and refuses 1,501", () => {
    expect(desc.safeParse(description("я".repeat(1500))).success).toBe(true);
    expect(desc.safeParse(description("я".repeat(1501))).success).toBe(false);
  });

  it("counts description characters, not UTF-16 units", () => {
    // 1,500 paw prints are 3,000 UTF-16 units.
    expect(desc.safeParse(description("🐾".repeat(1500))).success).toBe(true);
  });

  it("applies the limit to the English text too", () => {
    const result = desc.safeParse(description("Лагідний.", "a".repeat(1501)));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["en", "text"]);
  });
});

describe("AnimalPatchSchema", () => {
  it("refuses a patch whose name carries the token", () => {
    expect(AnimalPatchSchema.safeParse({ name: TOKEN }).success).toBe(false);
  });
});

/** K4-T15 (Oleksii: "fine"): the pause note's cap, counted in characters. */
describe("PauseReasonInputSchema", () => {
  it("trims the note, and a blank note means none", () => {
    expect(
      PauseReasonInputSchema.parse({ code: "relocation", note: "  Переїзд до Бучі  " }),
    ).toEqual({ code: "relocation", note: "Переїзд до Бучі" });
    expect(PauseReasonInputSchema.parse({ code: "other", note: "   " })).toEqual({
      code: "other",
      note: null,
    });
    expect(PauseReasonInputSchema.parse({ code: "other", note: null })).toEqual({
      code: "other",
      note: null,
    });
  });

  it("takes 2,000 characters and refuses 2,001, emoji counted as one each", () => {
    expect(PAUSE_NOTE_MAX_CHARACTERS).toBe(2000);
    expect(
      PauseReasonInputSchema.safeParse({ code: "other", note: "🐾".repeat(2000) }).success,
    ).toBe(true);
    expect(
      PauseReasonInputSchema.safeParse({ code: "other", note: "а".repeat(2001) }).success,
    ).toBe(false);
  });

  it("refuses an unknown code and an extra key", () => {
    expect(PauseReasonInputSchema.safeParse({ code: "holiday", note: null }).success).toBe(false);
    expect(
      PauseReasonInputSchema.safeParse({ code: "other", note: null, public: true }).success,
    ).toBe(false);
  });
});
