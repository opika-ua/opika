import { describe, expect, it } from "vitest";
import { makeDetailAnimal } from "../../../features/animal-detail/test-fixtures";
import { animalMetaDescription } from "./page";

describe("animalMetaDescription (PR B, the SEO review of page titles)", () => {
  it("species + shelter + city, then the animal's own description, within 160 characters", () => {
    const animal = makeDetailAnimal();
    const description = animalMetaDescription(animal, "Тестовий притулок «Домівка»", "Бровари");
    expect(description).toBe(
      "Кіт з притулку «Тестовий притулок «Домівка»», м. Бровари. Лагідний кіт, любить сидіти на підвіконні.",
    );
    expect(description.length).toBeLessThanOrEqual(160);
  });

  it("drops the city clause entirely when there is no city, rather than an empty м.", () => {
    const animal = makeDetailAnimal();
    const description = animalMetaDescription(animal, "Домівка", null);
    expect(description).toBe(
      "Кіт з притулку «Домівка». Лагідний кіт, любить сидіти на підвіконні.",
    );
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
    const prefix = "Кіт з притулку «Домівка», м. Бровари. ";
    const trimmedBody = description.slice(prefix.length);
    expect(animal.description.uk.startsWith(trimmedBody)).toBe(true);
  });

  it("never pads a short description up to a minimum length", () => {
    const animal = makeDetailAnimal({ description: { uk: "Коротко.", en: null } });
    const description = animalMetaDescription(animal, "Домівка", "Бровари");
    expect(description).toBe("Кіт з притулку «Домівка», м. Бровари. Коротко.");
  });

  it("a dog gets the dog label", () => {
    const animal = makeDetailAnimal({
      species: "dog",
      description: { uk: "Добрий пес.", en: null },
    });
    expect(animalMetaDescription(animal, "Домівка", null)).toBe(
      "Собака з притулку «Домівка». Добрий пес.",
    );
  });
});
