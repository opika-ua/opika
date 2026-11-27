import { describe, expect, it } from "vitest";
import { animalPhotoAlt, animalSeoSubject } from "./seo-text";

describe("animalSeoSubject, the first photo's alt (owner, 2026-11-27)", () => {
  it.each([
    {
      species: "dog",
      sex: "male",
      ageBucket: "adult",
      city: "Київ",
      expected: "Рекс – собака шукає дім, Київ",
    },
    {
      species: "dog",
      sex: "female",
      ageBucket: "baby",
      city: "Київ",
      expected: "Рекс – цуценя шукає дім, Київ",
    },
    {
      species: "cat",
      sex: "male",
      ageBucket: "young",
      city: "Бровари",
      expected: "Рекс – кіт шукає дім, Бровари",
    },
    {
      species: "cat",
      sex: "female",
      ageBucket: "adult",
      city: "Бровари",
      expected: "Рекс – кішка шукає дім, Бровари",
    },
    {
      species: "cat",
      sex: "male",
      ageBucket: "baby",
      city: "Львів",
      expected: "Рекс – кошеня шукає дім, Львів",
    },
    {
      species: "cat",
      sex: "female",
      ageBucket: "adult",
      city: null,
      expected: "Рекс – кішка шукає дім",
    },
    {
      species: "dog",
      sex: "male",
      ageBucket: "baby",
      city: null,
      expected: "Рекс – цуценя шукає дім",
    },
  ] as const)("$species $sex $ageBucket in $city", ({ city, expected, ...animal }) => {
    expect(animalSeoSubject({ name: "Рекс", ...animal }, city)).toBe(expected);
  });
});

describe("animalPhotoAlt, the photos after the first", () => {
  it("says the name and the photo's 1-based place, with an en dash", () => {
    expect(animalPhotoAlt("Рекс", 2)).toBe("Рекс – фото 2");
    expect(animalPhotoAlt("Мурчик", 10)).toBe("Мурчик – фото 10");
  });
});
