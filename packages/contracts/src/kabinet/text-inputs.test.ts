import { describe, expect, it } from "vitest";
import {
  AnimalPatchSchema,
  FreshnessSentenceInputSchema,
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

const description = (uk: string, en: string | null = null) => ({
  uk,
  en: en === null ? null : { text: en, provenance: "machine" },
});

const animalFields: readonly [string, Parser, Parser][] = [
  [
    "shelter.animals.createDraft",
    fieldOf(shelterAnimalsContract.createDraft, "name"),
    fieldOf(shelterAnimalsContract.createDraft, "description"),
  ],
  [
    "AnimalPatchSchema (shelter.animals.update)",
    AnimalPatchSchema.shape.name.unwrap(),
    AnimalPatchSchema.shape.description.unwrap(),
  ],
];

describe.each(animalFields)("%s", (_path, name, desc) => {
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
