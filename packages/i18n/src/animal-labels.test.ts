import { AGE_BUCKETS, type AgeSpan, SIZE_BUCKETS } from "@opika/domain";
import { describe, expect, it } from "vitest";
import {
  ageBucketLabel,
  ageSpanLabel,
  ageSpanWords,
  ageWordFor,
  animalFactsParts,
  sexWordFor,
  speciesWordFor,
} from "./animal-labels";

describe("ageBucketLabel", () => {
  it("returns a distinct, non-empty word for every bucket", () => {
    const labels = AGE_BUCKETS.map(ageBucketLabel);
    expect(labels.every((label) => label.length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(AGE_BUCKETS.length);
  });

  it("matches the card meta line's expected word for a known bucket", () => {
    expect(ageBucketLabel("young")).toBe("молодий");
  });
});

/** Q9 (Oleksii, 2026-10-18): "add a test for each sex × bucket". His words, transcribed. */
describe("ageWordFor, each sex × bucket", () => {
  it.each([
    ["male", "baby", "малюк"],
    ["male", "young", "молодий"],
    ["male", "adult", "дорослий"],
    ["male", "senior", "літній"],
    ["female", "baby", "малючка"],
    ["female", "young", "молода"],
    ["female", "adult", "доросла"],
    ["female", "senior", "літня"],
    ["unknown", "baby", "малюк"],
    ["unknown", "young", "молодий"],
    ["unknown", "adult", "дорослий"],
    ["unknown", "senior", "літній"],
  ] as const)("%s, %s → «%s»", (sex, bucket, word) => {
    expect(ageWordFor(bucket, sex)).toBe(word);
  });

  it("the masculine words are the card's long-standing ones, unchanged", () => {
    expect(AGE_BUCKETS.map(ageBucketLabel)).toEqual(["малюк", "молодий", "дорослий", "літній"]);
  });
});

const AGE_M = { baby: "малюк", young: "молодий", adult: "дорослий", senior: "літній" } as const;
const AGE_F = { baby: "малючка", young: "молода", adult: "доросла", senior: "літня" } as const;
const SIZE_M = { small: "малий", medium: "середній", large: "великий" } as const;
const SIZE_F = { small: "мала", medium: "середня", large: "велика" } as const;
const cap = (word: string) => word.charAt(0).toLocaleUpperCase("uk") + word.slice(1);

/** UX-2: every sex × age × size, with and without species, exact strings. */
describe("animalFactsParts", () => {
  const rows = (["male", "female", "unknown"] as const).flatMap((sex) =>
    AGE_BUCKETS.flatMap((age) => SIZE_BUCKETS.map((size) => ({ sex, age, size }))),
  );

  it.each(rows)("$sex $age $size, no species", ({ sex, age, size }) => {
    const f = sex === "female";
    const sexWord = sex === "male" ? ["Хлопчик"] : sex === "female" ? ["Дівчинка"] : [];
    const rest = [(f ? AGE_F : AGE_M)[age], (f ? SIZE_F : SIZE_M)[size]];
    const expected = [...sexWord, ...rest];
    expected[0] = cap(expected[0] as string);
    expect(animalFactsParts({ sex, ageBucket: age, size })).toEqual(expected);
  });

  it.each(rows)("$sex $age $size, with species", ({ sex, age, size }) => {
    const f = sex === "female";
    for (const [species, word] of [
      ["cat", "Кіт"],
      ["dog", "Собака"],
    ] as const) {
      const sexWord = sex === "male" ? ["хлопчик"] : sex === "female" ? ["дівчинка"] : [];
      expect(animalFactsParts({ species, sex, ageBucket: age, size })).toEqual([
        word,
        ...sexWord,
        (f ? AGE_F : AGE_M)[age],
        (f ? SIZE_F : SIZE_M)[size],
      ]);
    }
  });

  it("an unknown sex starts the line with the age, masculine throughout", () => {
    expect(
      animalFactsParts({ sex: "unknown", ageBucket: "young", size: "large" }).join(" · "),
    ).toBe("Молодий · великий");
  });

  it("leaves out a missing age or size (a kabinet draft)", () => {
    expect(animalFactsParts({ species: "dog", sex: "male", ageBucket: null, size: null })).toEqual([
      "Собака",
      "хлопчик",
    ]);
  });

  it("puts the caller's unknown-sex text in the sex slot, lowercase, only when asked", () => {
    const facts = { species: "cat", sex: "unknown", ageBucket: "adult", size: "small" } as const;
    expect(animalFactsParts({ ...facts, unknownSexText: "стать не вказана" })).toEqual([
      "Кіт",
      "стать не вказана",
      "дорослий",
      "малий",
    ]);
    expect(animalFactsParts(facts)).toEqual(["Кіт", "дорослий", "малий"]);
  });
});

/**
 * Age as a declared range (Oleksii, 2026-11-12, S1–S5 and answer 7), transcribed, never read
 * from the catalogue. «≈» is followed by a no-break space (U+00A0); a range takes an en dash.
 * The noun agrees with the upper number: the 1, 2, 5, 11, 21, 22 plural boundaries.
 */
describe("a declared range's words", () => {
  const NBSP = "\u00A0";

  it.each([
    [1, `≈${NBSP}1 рік`],
    [2, `≈${NBSP}2 роки`],
    [5, `≈${NBSP}5 років`],
    [11, `≈${NBSP}11 років`],
    [21, `≈${NBSP}21 рік`],
    [22, `≈${NBSP}22 роки`],
  ])("about %i → «%s»", (years, text) => {
    expect(ageSpanLabel({ kind: "about", years })).toBe(text);
  });

  it.each([
    [1, 2, `≈${NBSP}1–2 роки`],
    [4, 5, `≈${NBSP}4–5 років`],
    [9, 11, `≈${NBSP}9–11 років`],
    [19, 21, `≈${NBSP}19–21 рік`],
    [21, 22, `≈${NBSP}21–22 роки`],
  ])("between %i and %i → «%s»", (from, to, text) => {
    expect(ageSpanLabel({ kind: "between", from, to })).toBe(text);
  });

  it("the open end and «до 1 року» carry no «≈» (his answer 7)", () => {
    expect(ageSpanLabel({ kind: "at_least", from: 10 })).toBe("10+ років");
    expect(ageSpanLabel({ kind: "at_least", from: 12 })).toBe("12+ років");
    expect(ageSpanLabel({ kind: "at_least", from: 21 })).toBe("21+ років");
    expect(ageSpanLabel({ kind: "under_one" })).toBe("до 1 року");
  });

  it("every range is joined by an en dash (U+2013), never a hyphen or an em dash", () => {
    const text = ageSpanLabel({ kind: "between", from: 3, to: 4 });
    expect(text).toContain("3–4");
    expect(text).not.toMatch(/[-\u2014]/);
  });

  it("K3's six chips are the declared spans without «≈»", () => {
    const chips: AgeSpan[] = [
      { kind: "under_one" },
      { kind: "between", from: 1, to: 2 },
      { kind: "between", from: 3, to: 4 },
      { kind: "between", from: 5, to: 7 },
      { kind: "between", from: 8, to: 10 },
      { kind: "at_least", from: 10 },
    ];
    expect(chips.map(ageSpanWords)).toEqual([
      "до 1 року",
      "1–2 роки",
      "3–4 роки",
      "5–7 років",
      "8–10 років",
      "10+ років",
    ]);
  });

  it("replaces the bucket word in the facts line, and starts it capitalised", () => {
    const between: AgeSpan = { kind: "between", from: 3, to: 4 };
    expect(
      animalFactsParts({ sex: "male", ageBucket: "adult", ageSpan: between, size: "small" }).join(
        " · ",
      ),
    ).toBe(`Хлопчик · ≈${NBSP}3–4 роки · малий`);
    expect(
      animalFactsParts({
        sex: "unknown",
        ageBucket: "baby",
        ageSpan: { kind: "under_one" },
        size: "small",
      }).join(" · "),
    ).toBe("До 1 року · малий");
    expect(
      animalFactsParts({
        species: "dog",
        sex: "female",
        ageBucket: "senior",
        ageSpan: { kind: "at_least", from: 12 },
        size: "large",
      }),
    ).toEqual(["Собака", "дівчинка", "12+ років", "велика"]);
  });

  it("a null span keeps the bucket word, exactly as before", () => {
    expect(
      animalFactsParts({ sex: "female", ageBucket: "young", ageSpan: null, size: "small" }),
    ).toEqual(["Дівчинка", "молода", "мала"]);
  });
});

/** gallery-v3 (Figma `58:1617`): the redesigned card names sex as its own word. */
describe("sexWordFor", () => {
  it.each([
    ["male", "Хлопчик"],
    ["female", "Дівчинка"],
  ] as const)("%s → «%s»", (sex, word) => {
    expect(sexWordFor(sex)).toBe(word);
  });

  it("an unknown sex has no word - the caller omits it rather than guessing", () => {
    expect(sexWordFor("unknown")).toBeNull();
  });
});

/**
 * The animal page's meta description (PR B, the SEO review of page titles), owner's exact
 * wording: cat male «Кіт», female «Кішка»; dog male «Пес», female «Собака»; unknown sex takes
 * the masculine form, same convention `ageWordFor` above already uses.
 */
describe("speciesWordFor, each sex × species", () => {
  it.each([
    ["male", "cat", "Кіт"],
    ["female", "cat", "Кішка"],
    ["unknown", "cat", "Кіт"],
    ["male", "dog", "Пес"],
    ["female", "dog", "Собака"],
    ["unknown", "dog", "Пес"],
  ] as const)("%s, %s → «%s»", (sex, species, word) => {
    expect(speciesWordFor(species, sex)).toBe(word);
  });
});
