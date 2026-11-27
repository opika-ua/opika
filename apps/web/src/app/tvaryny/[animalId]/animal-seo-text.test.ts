import { describe, expect, it } from "vitest";
import { makeDetailAnimal, makeDetailShelter } from "../../../features/animal-detail/test-fixtures";
import { animalMetadataOf, animalSeoText, firstSentenceOf } from "./page";

/** SEO handoff B1–B2 for `/tvaryny/{id}`: the title, the description and the previews. */
describe("animalSeoText", () => {
  it("names the animal, its noun and the effective city, then the brand", () => {
    const { title } = animalSeoText(makeDetailAnimal(), "Домівка", "Бровари");
    expect(title).toBe("Мурчик – кіт шукає дім, Бровари – Opika");
  });

  it.each([
    ["cat", "female", "adult", "кішка"],
    ["cat", "unknown", "adult", "кіт"],
    ["cat", "male", "baby", "кошеня"],
    ["dog", "male", "senior", "собака"],
    ["dog", "female", "baby", "цуценя"],
  ] as const)("a %s, %s, %s is «%s»", (species, sex, ageBucket, noun) => {
    const animal = makeDetailAnimal({ species, sex, ageBucket });
    expect(animalSeoText(animal, "Домівка", "Ірпінь").title).toBe(
      `Мурчик – ${noun} шукає дім, Ірпінь – Opika`,
    );
  });

  it("over 60 characters, drops « – Opika» before anything else", () => {
    const animal = makeDetailAnimal({ name: "Принцеса Марципанка", sex: "female" });
    const { title } = animalSeoText(animal, "Домівка", "Новоград-Волинський");
    expect(title).toBe("Принцеса Марципанка – кішка шукає дім, Новоград-Волинський");
    const branded = "Принцеса Марципанка – кішка шукає дім, Новоград-Волинський – Opika";
    expect(Array.from(branded).length).toBeGreaterThan(60);
  });

  it("describes the animal, the city, the shelter and the story's first sentence", () => {
    const animal = makeDetailAnimal({
      description: { uk: "Лагідний кіт. Любить підвіконня.", en: null },
    });
    expect(animalSeoText(animal, "Домівка", "Бровари").description).toBe(
      "Мурчик шукає дім. Бровари · Домівка. Лагідний кіт.",
    );
  });

  it("with no story, the description ends after the shelter", () => {
    const animal = makeDetailAnimal({ description: { uk: "", en: null } });
    expect(animalSeoText(animal, "Домівка", "Бровари").description).toBe(
      "Мурчик шукає дім. Бровари · Домівка.",
    );
  });

  it("a long one stays under 155 characters and ends in «…»", () => {
    const animal = makeDetailAnimal({
      description: {
        uk: "Дуже добрий і спокійний кіт, який любить гратися з іграшками, спати на підвіконні та отримувати увагу від усіх відвідувачів притулку щодня і щовечора",
        en: null,
      },
    });
    const { description } = animalSeoText(animal, "Домівка", "Бровари");
    expect(Array.from(description).length).toBeLessThan(155);
    expect(description.endsWith("…")).toBe(true);
  });

  it("a city that doesn't resolve takes the no-city pair (owner, 2026-11-18)", () => {
    expect(animalSeoText(makeDetailAnimal(), "Домівка", null)).toEqual({
      title: "Мурчик – кіт шукає дім – Opika",
      description: "Мурчик шукає дім. Домівка. Лагідний кіт, любить сидіти на підвіконні.",
    });
  });

  it("no city and no story: the description ends after the shelter", () => {
    const animal = makeDetailAnimal({ description: { uk: "", en: null } });
    expect(animalSeoText(animal, "Домівка", null).description).toBe("Мурчик шукає дім. Домівка.");
  });

  it("no city, over 60 characters: « – Opika» goes first; a long one is cut under 155 with «…»", () => {
    const animal = makeDetailAnimal({
      name: "Принцеса Марципанка Найкраща Із Усіх",
      sex: "female",
      description: { uk: `${"Дуже добра й лагідна кішка ".repeat(8)}.`, en: null },
    });
    const { title, description } = animalSeoText(animal, "Домівка", null);
    expect(title).toBe("Принцеса Марципанка Найкраща Із Усіх – кішка шукає дім");
    expect(Array.from(description).length).toBeLessThan(155);
    expect(description.endsWith("…")).toBe(true);
  });

  it("the first sentence ends at . ! ? or …, whitespace collapsed", () => {
    expect(firstSentenceOf("Грайливий!  Любить   мʼячики.")).toBe("Грайливий!");
    expect(firstSentenceOf("Без крапки в кінці")).toBe("Без крапки в кінці");
    expect(firstSentenceOf("  Рядок\nперший. Другий.")).toBe("Рядок перший.");
  });
});

describe("animalMetadataOf: one string for the page, Open Graph and Twitter", () => {
  it("OG and Twitter carry the page's own title and description", () => {
    const metadata = animalMetadataOf({
      kind: "animal",
      view: {
        animal: makeDetailAnimal(),
        shelter: makeDetailShelter(),
        cityName: "Бровари",
        cityPlace: "м. Бровари",
        backToGalleryHref: "/",
      },
    } as never);
    expect(metadata.title).toEqual({ absolute: "Мурчик – кіт шукає дім, Бровари – Opika" });
    expect(metadata.openGraph?.title).toBe("Мурчик – кіт шукає дім, Бровари – Opika");
    expect(metadata.twitter?.title).toBe("Мурчик – кіт шукає дім, Бровари – Opika");
    expect(metadata.openGraph?.description).toBe(metadata.description);
    expect(metadata.twitter?.description).toBe(metadata.description);
    expect(metadata.alternates?.canonical).toMatch(/^\/tvaryny\/[0-9a-f-]+$/);
  });
});
