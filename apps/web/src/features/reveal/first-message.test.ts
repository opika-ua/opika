import { AnimalIdSchema } from "@opika/domain";
import { describe, expect, it } from "vitest";
import { animalPageUrl, firstMessageOf } from "./first-message";

const ANIMAL_ID = AnimalIdSchema.parse("11111111-2222-4333-8444-555555555555");
const URL_ = "https://opika.org.ua/tvaryny/11111111-2222-4333-8444-555555555555";

// The owner's approved rows 2–4 (2026-11-24), written out rather than read from the catalogue.
describe("firstMessageOf", () => {
  it("builds the card's canonical address, as the share button does", () => {
    expect(animalPageUrl(ANIMAL_ID)).toBe(URL_);
  });

  it.each([
    ["male", `Добрий день. Пишу щодо картки «Барсик» на Opika: ${URL_}. Він ще шукає дім?`],
    ["female", `Добрий день. Пишу щодо картки «Барсик» на Opika: ${URL_}. Вона ще шукає дім?`],
    [
      "unknown",
      `Добрий день. Пишу щодо картки «Барсик» на Opika: ${URL_}. Ця тварина ще шукає дім?`,
    ],
  ] as const)("%s", (sex, expected) => {
    expect(firstMessageOf({ animalName: "Барсик", sex, animalUrl: URL_ })).toBe(expected);
  });

  it("prints a name with quotes, emoji, braces or $ patterns as typed", () => {
    for (const name of ['Ліза «Лапа» "Мала"', "Кіт 🐱 Мурчик", "Пес $& $1", "{url} {site}"]) {
      expect(firstMessageOf({ animalName: name, sex: "female", animalUrl: URL_ })).toBe(
        `Добрий день. Пишу щодо картки «${name}» на Opika: ${URL_}. Вона ще шукає дім?`,
      );
    }
  });
});
