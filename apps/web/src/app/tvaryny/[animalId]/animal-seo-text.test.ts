import { describe, expect, it } from "vitest";
import { makeDetailAnimal, makeDetailShelter } from "../../../features/animal-detail/test-fixtures";
import { animalMetadataOf, animalSeoText } from "./page";

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

  it.each([
    [
      "all traits",
      {},
      "Бровари",
      "Домівка",
      "Мурчик – кіт, хлопчик, молодий, малий. Шукає дім – Бровари. Домівка.",
    ],
    [
      "a female: age and size agree with her sex",
      { sex: "female", ageBucket: "adult", size: "large" },
      "Бровари",
      "Домівка",
      "Мурчик – кішка, дівчинка, доросла, велика. Шукає дім – Бровари. Домівка.",
    ],
    [
      "an unknown sex is skipped, not guessed",
      { sex: "unknown" },
      "Бровари",
      "Домівка",
      "Мурчик – кіт, молодий, малий. Шукає дім – Бровари. Домівка.",
    ],
    [
      "a declared age range replaces the bucket word",
      { ageSpan: { kind: "between", from: 3, to: 4 } },
      "Бровари",
      "Домівка",
      "Мурчик – кіт, хлопчик, 3–4 роки, малий. Шукає дім – Бровари. Домівка.",
    ],
    [
      "a city ending in a period gets one full stop, not two",
      {},
      "Вишневе, Чернівецька обл.",
      "Домівка",
      "Мурчик – кіт, хлопчик, молодий, малий. Шукає дім – Вишневе, Чернівецька обл. Домівка.",
    ],
    [
      "a shelter name ending in a period likewise",
      {},
      "Бровари",
      "Дім тварин ім. Т.",
      "Мурчик – кіт, хлопчик, молодий, малий. Шукає дім – Бровари. Дім тварин ім. Т.",
    ],
    [
      "no city: the pair without «– city»",
      {},
      null,
      "Домівка",
      "Мурчик – кіт, хлопчик, молодий, малий. Шукає дім. Домівка.",
    ],
  ] as const)("%s", (_name, overrides, city, shelter, expected) => {
    const description = animalSeoText(makeDetailAnimal(overrides), shelter, city).description;
    expect(description).toBe(expected);
    expect(description).not.toContain("..");
  });

  it("a long shelter name is cut at a word under 155 characters, ending in «…»", () => {
    const shelter =
      "Благодійна організація допомоги безпритульним тваринам «Лапки й хвостики Придніпровського регіону»";
    const { description } = animalSeoText(makeDetailAnimal(), shelter, "Бровари");
    expect(Array.from(description).length).toBeLessThan(155);
    expect(description.endsWith("…")).toBe(true);
    expect(
      description.startsWith("Мурчик – кіт, хлопчик, молодий, малий. Шукає дім – Бровари. "),
    ).toBe(true);
  });

  it("never carries the story, and so never a phone number a story holds", () => {
    const PHONE = /\+?\d[\d\s\-()]{5,}\d/u;
    const stories = [
      "Дзвоніть +380 50 123 45 67, забере будь-коли.",
      "Тел. (067) 555-12-34 або 0991234567.",
      "Звертайтесь 38-050-123-45-67",
    ];
    for (const story of stories) {
      const animal = makeDetailAnimal({ description: { uk: story, en: null } });
      for (const city of ["Бровари", null]) {
        const { title, description } = animalSeoText(animal, "Домівка", city);
        expect(description).not.toMatch(PHONE);
        expect(title).not.toMatch(PHONE);
        expect(description).not.toContain("Дзвоніть");
      }
    }
  });

  it("a city that doesn't resolve takes the no-city pair (owner, 2026-11-18)", () => {
    expect(animalSeoText(makeDetailAnimal(), "Домівка", null)).toEqual({
      title: "Мурчик – кіт шукає дім – Opika",
      description: "Мурчик – кіт, хлопчик, молодий, малий. Шукає дім. Домівка.",
    });
  });

  it("no city, over 60 characters: « – Opika» goes first", () => {
    const animal = makeDetailAnimal({
      name: "Принцеса Марципанка Найкраща Із Усіх",
      sex: "female",
    });
    expect(animalSeoText(animal, "Домівка", null).title).toBe(
      "Принцеса Марципанка Найкраща Із Усіх – кішка шукає дім",
    );
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

  it("the whole head of an animal page: title, description, canonical, Open Graph, Twitter", () => {
    const animal = makeDetailAnimal();
    const metadata = animalMetadataOf({
      kind: "animal",
      view: {
        animal,
        shelter: makeDetailShelter({ displayName: "Домівка" }),
        cityName: "Бровари",
        cityPlace: "м. Бровари",
        backToGalleryHref: "/",
      },
    } as never);
    const title = "Мурчик – кіт шукає дім, Бровари – Opika";
    const description = "Мурчик – кіт, хлопчик, молодий, малий. Шукає дім – Бровари. Домівка.";
    expect(metadata.title).toEqual({ absolute: title });
    expect(metadata.description).toBe(description);
    expect(metadata.alternates?.canonical).toBe(`/tvaryny/${animal.id}`);
    expect(metadata.openGraph).toMatchObject({ type: "article", title, description });
    expect(metadata.twitter).toMatchObject({ title, description });
  });
});
