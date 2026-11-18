import type { AnimalSpecies } from "@opika/domain";
import { describe, expect, it } from "vitest";
import {
  DESCRIPTION,
  makeShelterPageShelter,
  makeShelterPageView,
} from "../../../features/shelters/test-fixtures";
import { LINK_PREVIEW_DESCRIPTION } from "../../../seo-text";
import { shelterMetadataOf } from "./page";

function metadataFor({
  displayName = "Лапа допомоги",
  listedSpecies = ["dog"] as readonly AnimalSpecies[],
  cityName = "Бровари" as string | null,
  description = { uk: DESCRIPTION, en: null } as { uk: string; en: null } | null,
} = {}) {
  return shelterMetadataOf({
    kind: "shelter",
    view: makeShelterPageView({
      shelter: makeShelterPageShelter({ displayName, description }),
      listedSpecies,
      cityName,
    }),
  });
}

describe("the shelter page's title (SEO handoff B2)", () => {
  it("is the approved template with the city in the nominative, the brand at the end", () => {
    const metadata = metadataFor();
    expect(metadata.title).toEqual({
      absolute: "Лапа допомоги – тварини шукають дім, Бровари | Opika",
    });
  });

  it.each([
    // 21 + 31 + 8 = 60: fits, keeps the brand.
    ["Притулок «Добрі руки»", "Притулок «Добрі руки» – тварини шукають дім, Бровари | Opika"],
    // 61: « | Opika» goes first.
    ["Притулок «Добрі лапки»", "Притулок «Добрі лапки» – тварини шукають дім, Бровари"],
    [
      "Благодійна організація «Друзі хвостиків Київщини»",
      "Благодійна організація «Друзі хвостиків Київщини» – тварини шукають дім, Бровари",
    ],
  ])("over 60 characters drops « | Opika» first: %s", (displayName, title) => {
    expect(metadataFor({ displayName }).title).toEqual({ absolute: title });
  });

  it("falls back to the name with the brand when the city does not resolve", () => {
    expect(metadataFor({ cityName: null }).title).toEqual({ absolute: "Лапа допомоги – Opika" });
  });
});

describe("the shelter page's meta description (SEO handoff B2)", () => {
  it.each([
    [
      ["dog"],
      "Лапа допомоги, Бровари: собаки, які шукають дім. Контакти – на картці кожної тварини.",
    ],
    [
      ["cat"],
      "Лапа допомоги, Бровари: коти, які шукають дім. Контакти – на картці кожної тварини.",
    ],
    [
      ["dog", "cat"],
      "Лапа допомоги, Бровари: собаки й коти, які шукають дім. Контакти – на картці кожної тварини.",
    ],
  ] as const)("names the species the shelter lists: %j", (listedSpecies, description) => {
    expect(metadataFor({ listedSpecies }).description).toBe(description);
  });

  it("cuts a long one at a word boundary, under 155 characters, with «…»", () => {
    const description = metadataFor({
      displayName:
        "Громадська організація «Притулок для безпритульних тварин міста Бровари та навколишніх сіл імені Сірка»",
      listedSpecies: ["dog", "cat"],
    }).description;
    expect(description).toBe(
      "Громадська організація «Притулок для безпритульних тварин міста Бровари та навколишніх сіл імені Сірка», Бровари: собаки й коти, які шукають дім…",
    );
    expect(Array.from(description as string).length).toBeLessThan(155);
  });

  it("the page, its link preview and its Twitter card carry the same title and description", () => {
    const metadata = metadataFor({ listedSpecies: ["cat"] });
    const title = "Лапа допомоги – тварини шукають дім, Бровари | Opika";
    const description =
      "Лапа допомоги, Бровари: коти, які шукають дім. Контакти – на картці кожної тварини.";
    expect(metadata.description).toBe(description);
    expect(metadata.openGraph).toMatchObject({
      title,
      description,
      siteName: "Opika",
      locale: "uk_UA",
    });
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image", title, description });
  });

  describe("with no listed animal there is no species to name, so the shelter's own text stands in", () => {
    it("is that text, unpadded", () => {
      expect(metadataFor({ listedSpecies: [] }).description).toBe(DESCRIPTION);
    });

    it("or the root layout's default when the shelter has no text", () => {
      for (const none of [null, { uk: "   ", en: null } as const]) {
        const metadata = metadataFor({ listedSpecies: [], description: none });
        expect(metadata.description).toBe(LINK_PREVIEW_DESCRIPTION);
        expect(metadata.openGraph?.description).toBe(LINK_PREVIEW_DESCRIPTION);
      }
    });

    it("cut under 155 characters with «…» when long", () => {
      const long = `${"слово ".repeat(400)}кінець`;
      const description = metadataFor({
        listedSpecies: [],
        description: { uk: long, en: null },
      }).description as string;
      expect(Array.from(description).length).toBeLessThan(155);
      expect(description.endsWith("слово…")).toBe(true);
    });
  });

  it("the same text stands in when the city does not resolve", () => {
    expect(metadataFor({ cityName: null }).description).toBe(DESCRIPTION);
  });
});
