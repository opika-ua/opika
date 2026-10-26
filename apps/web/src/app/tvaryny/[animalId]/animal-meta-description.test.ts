import { describe, expect, it } from "vitest";
import { makeDetailAnimal } from "../../../features/animal-detail/test-fixtures";
import { animalMetaDescription } from "./page";

describe("animalMetaDescription (PR B, the SEO review of page titles)", () => {
  it("species word + name + city + shelter, then the animal's own description, within 160 characters", () => {
    const animal = makeDetailAnimal();
    const description = animalMetaDescription(animal, "Тестовий притулок «Домівка»", "Бровари");
    expect(description).toBe(
      "Кіт Мурчик · Бровари · Тестовий притулок «Домівка». Лагідний кіт, любить сидіти на підвіконні.",
    );
    expect(description.length).toBeLessThanOrEqual(160);
  });

  it("drops the city clause entirely when there is no city, rather than an empty segment", () => {
    const animal = makeDetailAnimal();
    const description = animalMetaDescription(animal, "Домівка", null);
    expect(description).toBe("Кіт Мурчик · Домівка. Лагідний кіт, любить сидіти на підвіконні.");
  });

  it("trims a long description at a word boundary rather than cutting a word in half", () => {
    const animal = makeDetailAnimal({
      description: {
        uk: "Дуже добрий і спокійний кіт, який любить гратися з іграшками, спати на підвіконні та отримувати увагу від усіх відвідувачів притулку щодня",
        en: null,
      },
    });
    const description = animalMetaDescription(animal, "Домівка", "Бровари");
    expect(description.length).toBeLessThanOrEqual(160);
    expect(description.endsWith(" ")).toBe(false);
    // Every word in the trimmed description actually appears in the source text.
    const prefix = "Кіт Мурчик · Бровари · Домівка. ";
    const trimmedBody = description.slice(prefix.length);
    expect(animal.description.uk.startsWith(trimmedBody)).toBe(true);
  });

  it("never pads a short description up to a minimum length", () => {
    const animal = makeDetailAnimal({ description: { uk: "Коротко.", en: null } });
    const description = animalMetaDescription(animal, "Домівка", "Бровари");
    expect(description).toBe("Кіт Мурчик · Бровари · Домівка. Коротко.");
  });

  it("a dog gets its own sex-aware species word, not the cat's", () => {
    const animal = makeDetailAnimal({
      species: "dog",
      description: { uk: "Добрий пес.", en: null },
    });
    expect(animalMetaDescription(animal, "Домівка", null)).toBe(
      "Пес Мурчик · Домівка. Добрий пес.",
    );
  });

  it("no «з притулку», no «м.», and no quotes around the shelter name", () => {
    const animal = makeDetailAnimal({ description: { uk: "Опис.", en: null } });
    const description = animalMetaDescription(animal, "Домівка", "Бровари");
    expect(description).not.toContain("з притулку");
    expect(description).not.toContain("м.");
    expect(description).not.toContain("«Домівка»");
  });

  it("never lets the prefix alone exceed 160 characters, found on review - an unusually long shelter name is trimmed too", () => {
    const animal = makeDetailAnimal({ description: { uk: "Опис.", en: null } });
    const longName =
      "Дуже-дуже довга назва притулку, яка сама по собі займає більше ста тридцяти символів тексту якщо її не скоротити";
    expect(longName.length).toBeGreaterThan(110);
    const description = animalMetaDescription(animal, longName, "Бровари");
    expect(description.length).toBeLessThanOrEqual(160);
    // The shelter name itself was trimmed at a word boundary, not the whole sentence
    // silently dropped or cut mid-word.
    const afterLastSeparator = description.split(" · ").at(-1) ?? "";
    const trimmedName = afterLastSeparator.split(".")[0] ?? "";
    expect(longName.startsWith(trimmedName)).toBe(true);
  });

  /**
   * Found on review: the test above never actually exercises a trim - `longName`'s 112
   * characters fit comfortably inside its 136-character budget, so removing the trim
   * (or even the `- 3 - 1` adjustment entirely) left it green. This fixture has no
   * spaces, so `trimAtWordBoundary` can't cut at a word boundary and instead hard-cuts
   * to exactly the shelter budget - which pins the "- 3 - 1" arithmetic precisely: the
   * fixed prefix is exactly 20 characters ("Кіт Мурчик · Бровари"), so the shelter name
   * is cut to exactly 136, making the full description exactly 160. Either constant
   * changing by even one shifts that total off 160, in either direction.
   */
  it("pins the shelter-name budget arithmetic exactly, not just under the 160 ceiling", () => {
    const animal = makeDetailAnimal({ description: { uk: "Короткий опис.", en: null } });
    const noSpaceShelterName = "а".repeat(200);
    const description = animalMetaDescription(animal, noSpaceShelterName, "Бровари");
    expect(description.length).toBe(160);
    expect(description.endsWith(".")).toBe(true);
    // No body: the shelter name alone used up the entire budget.
    expect(description).not.toContain("Короткий опис");
  });

  it("omits the body sentence entirely rather than show a cut-off word, when too little room is left for it", () => {
    const animal = makeDetailAnimal({
      description: { uk: "Ляльопундра зовсім інакша фраза для теста.", en: null },
    });
    const longName =
      "Притулок із дуже-дуже довгою назвою, яка сама по собі займає майже весь бюджет цього опису, настільки довгою що тексту вже не лишається місця зовсім";
    const description = animalMetaDescription(animal, longName, "Бровари");
    expect(description.length).toBeLessThanOrEqual(160);
    // No fragment of the animal's own description leaked into the result.
    expect(description).not.toContain("Ляльопундра");
  });

  /**
   * Found on review: neither existing test actually lands inside the [1, 20) window
   * `MIN_USEFUL_BODY_LENGTH` is meant to guard - the fixture above leaves exactly 0
   * characters of body budget, which would omit the body even if the threshold were 1.
   * This fixture's shelter name is sized so the body budget is exactly 10: room enough
   * for a real fragment of the description to fit, but below the 20-character floor -
   * proving the floor itself is doing the excluding, not merely "no room at all".
   */
  it("the body-omission floor excludes a fragment that would otherwise fit, not just a zero budget", () => {
    const animal = makeDetailAnimal({ description: { uk: "Короткийопис.", en: null } });
    // 32 repetitions of "дім " (4 chars each), trimmed and cut to exactly 125 chars of
    // shelter name -> a prefix of 149 chars -> a body budget of exactly 10.
    const shelterName = "дім ".repeat(32).trim().slice(0, 125);
    const description = animalMetaDescription(animal, shelterName, "Бровари");
    expect(description.endsWith(".")).toBe(true);
    expect(description).not.toContain("Короткийоп");
  });

  /**
   * Owner's explicit ask alongside the format change: "Add a test for female/male/unknown
   * × cat/dog." `speciesWordFor` itself has the exhaustive table
   * (`packages/i18n/src/animal-labels.test.ts`); this covers the same six combinations
   * through the function that actually builds the description.
   */
  it.each([
    ["male", "cat", "Кіт"],
    ["female", "cat", "Кішка"],
    ["unknown", "cat", "Кіт"],
    ["male", "dog", "Пес"],
    ["female", "dog", "Собака"],
    ["unknown", "dog", "Пес"],
  ] as const)("%s %s → «%s» in the description", (sex, species, speciesWord) => {
    const animal = makeDetailAnimal({ species, sex, description: { uk: "Опис.", en: null } });
    const description = animalMetaDescription(animal, "Домівка", null);
    expect(description.startsWith(`${speciesWord} ${animal.name} · Домівка.`)).toBe(true);
  });
});
