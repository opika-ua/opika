import type { CityLabelView } from "@opika/contracts";
import type { AnimalSpecies, CityId } from "@opika/domain";
import { describe, expect, it } from "vitest";
import { expectOgUrlIsCanonical } from "../../../../seo/og-url-assert";
import { cityPageMetadataOf, citySeoText } from "./page";

const city = (name: string, slug = "brovary-kyivska"): CityLabelView =>
  ({
    id: "c1000000-0000-4000-8000-000000000001" as CityId,
    slug,
    kind: "city",
    nameScope: "unique_in_ukraine",
    regionId: "r0000000-0000-4000-8000-000000000001",
    name,
    regionShort: "Київська обл.",
    raion: null,
  }) as unknown as CityLabelView;

const loaded = (species: readonly AnimalSpecies[], name = "Бровари") =>
  ({ kind: "city", city: city(name), species }) as const;

describe("citySeoText: the city row (variant B)", () => {
  it.each([
    [
      ["dog"],
      "Взяти собаку з притулку – Бровари – Opika",
      "Собаки в добрі руки з притулків і від волонтерів – Бровари. Напишіть напряму, контакти – на картці.",
    ],
    [
      ["cat"],
      "Взяти кота з притулку – Бровари – Opika",
      "Коти в добрі руки з притулків і від волонтерів – Бровари. Напишіть напряму, контакти – на картці.",
    ],
    [
      ["dog", "cat"],
      "Взяти собаку чи кота з притулку – Бровари – Opika",
      "Собаки й коти в добрі руки з притулків і від волонтерів – Бровари. Напишіть напряму, контакти – на картці.",
    ],
  ] as const)(
    "%j: the species decides the title and the description",
    (species, title, description) => {
      const metadata = cityPageMetadataOf(loaded(species), 1);
      expect(metadata.title).toEqual({ absolute: title });
      expect(metadata.description).toBe(description);
    },
  );

  it("drops « – Opika» only when the title would pass 60 characters", () => {
    const both = { kind: "listed", key: "dogsAndCats" } as const;
    const short = citySeoText("Бровари", both).title;
    expect(short.endsWith(" – Opika")).toBe(true);
    expect(Array.from(short).length).toBeLessThanOrEqual(60);

    // «Взяти собаку чи кота з притулку – » is 34 characters: a 20-character city passes 60 only with the suffix.
    const longName = "Олександрівка-Покров";
    const long = citySeoText(longName, both).title;
    expect(long).toBe(`Взяти собаку чи кота з притулку – ${longName}`);
    expect(Array.from(`${long} – Opika`).length).toBeGreaterThan(60);
  });

  it("a label ending in «обл.» ends its sentence with one period, not two", () => {
    const { description } = citySeoText("Вишневе, Чернівецька обл.", {
      kind: "listed",
      key: "dogs",
    });
    expect(description).toBe(
      "Собаки в добрі руки з притулків і від волонтерів – Вишневе, Чернівецька обл. Напишіть напряму, контакти – на картці.",
    );
    expect(description).not.toContain("..");
  });

  it("a long description is cut at a word under 155 characters, ending in «…»", () => {
    const longName = "Велика Олександрівка, Херсонська обл., Бериславський р-н, громада";
    const { description } = citySeoText(longName, { kind: "listed", key: "dogsAndCats" });
    expect(Array.from(description).length).toBeLessThan(155);
    expect(description.endsWith("…")).toBe(true);
  });
});

describe("the city page's head, page 1 and page 2", () => {
  it("page 1: title, description, canonical, Open Graph and Twitter in full", () => {
    const title = "Взяти кота з притулку – Бровари – Opika";
    const description =
      "Коти в добрі руки з притулків і від волонтерів – Бровари. Напишіть напряму, контакти – на картці.";
    const metadata = cityPageMetadataOf(loaded(["cat"]), 1);
    expect(metadata.title).toEqual({ absolute: title });
    expect(metadata.description).toBe(description);
    expect(metadata.alternates?.canonical).toBe("/tvaryny/misto/brovary-kyivska");
    expect(metadata.openGraph).toMatchObject({
      title,
      description,
      siteName: "Opika",
      locale: "uk_UA",
    });
    expect(metadata.twitter).toMatchObject({ title, description });
  });

  it("page 2: «– сторінка 2» before the site name, the same description, a self-referencing canonical", () => {
    const title = "Взяти кота з притулку – Бровари – сторінка 2 – Opika";
    const description =
      "Коти в добрі руки з притулків і від волонтерів – Бровари. Напишіть напряму, контакти – на картці.";
    const metadata = cityPageMetadataOf(loaded(["cat"]), 2);
    expect(metadata.title).toEqual({ absolute: title });
    expect(metadata.description).toBe(description);
    expect(metadata.alternates?.canonical).toBe("/tvaryny/misto/brovary-kyivska?stor=2");
    expect(metadata.openGraph).toMatchObject({ title, description });
    expect(metadata.twitter).toMatchObject({ title, description });
  });

  it("a long page-2 title drops the site name first and keeps the page", () => {
    const title = cityPageMetadataOf(loaded(["dog", "cat"], "Олександрівка-Покров"), 3).title;
    expect(title).toEqual({
      absolute: "Взяти собаку чи кота з притулку – Олександрівка-Покров – сторінка 3",
    });
  });
});

describe("the city page's canonical (owner, 2026-11-18)", () => {
  it("is the bare city page on page 1, and keeps the page number past it", () => {
    expect(cityPageMetadataOf(loaded(["dog"]), 1).alternates?.canonical).toBe(
      "/tvaryny/misto/brovary-kyivska",
    );
    expect(cityPageMetadataOf(loaded(["dog"]), 4).alternates?.canonical).toBe(
      "/tvaryny/misto/brovary-kyivska?stor=4",
    );
  });

  it("a refusal to answer is noindex; a 404 or a 308 sets nothing of its own", () => {
    expect(cityPageMetadataOf({ kind: "rate_limited" }, 1)).toEqual({
      robots: { index: false, follow: false },
    });
    expect(cityPageMetadataOf({ kind: "not_found" }, 1)).toEqual({});
    expect(cityPageMetadataOf({ kind: "moved", slug: "brovary-kyivska" }, 1)).toEqual({});
  });
});

describe("the city page's og:url is its canonical", () => {
  it("page 1 and page 2 are each their own, absolute", () => {
    expectOgUrlIsCanonical(
      cityPageMetadataOf(loaded(["dog"]), 1),
      "/tvaryny/misto/brovary-kyivska",
    );
    expectOgUrlIsCanonical(
      cityPageMetadataOf(loaded(["dog"]), 2),
      "/tvaryny/misto/brovary-kyivska?stor=2",
    );
  });
});
