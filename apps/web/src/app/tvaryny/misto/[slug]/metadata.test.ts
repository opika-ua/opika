import type { CityLabelView } from "@opika/contracts";
import type { AnimalSpecies, CityId } from "@opika/domain";
import { describe, expect, it } from "vitest";
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

describe("citySeoText: handoff B2's city row", () => {
  it.each([
    [["dog"], "Собаки в добрі руки – Бровари | Opika", "Собаки з притулків"],
    [["cat"], "Коти в добрі руки – Бровари | Opika", "Коти з притулків"],
    [["dog", "cat"], "Собаки й коти в добрі руки – Бровари | Opika", "Собаки й коти з притулків"],
  ] as const)(
    "%j: the species phrase leads the title and the description",
    (species, title, lead) => {
      const metadata = cityPageMetadataOf(loaded(species), 1);
      expect(metadata.title).toEqual({ absolute: title });
      expect(metadata.description).toBe(
        `${lead} і від волонтерів шукають дім – Бровари. Напишіть напряму, контакти – на картці.`,
      );
    },
  );

  it("drops « | Opika» only when the title would pass 60 characters", () => {
    const short = citySeoText("Бровари", { kind: "listed", key: "dogsAndCats" }).title;
    expect(short.endsWith(" | Opika")).toBe(true);
    expect(Array.from(short).length).toBeLessThanOrEqual(60);

    // 29 characters of subject before the city: a 24-character name passes 60 only with the suffix.
    const longName = "Олександрівка-Покровська";
    const long = citySeoText(longName, { kind: "listed", key: "dogsAndCats" }).title;
    expect(long).toBe(`Собаки й коти в добрі руки – ${longName}`);
    expect(Array.from(`${long} | Opika`).length).toBeGreaterThan(60);
  });

  it("a long description is cut at a word under 155 characters, ending in «…»", () => {
    const longName = "Велика Олександрівка, Херсонська обл., Бериславський р-н, громада";
    const { description } = citySeoText(longName, { kind: "listed", key: "dogsAndCats" });
    expect(Array.from(description).length).toBeLessThan(155);
    expect(description.endsWith("…")).toBe(true);
  });

  it("the link preview and the Twitter card carry the same strings", () => {
    const metadata = cityPageMetadataOf(loaded(["cat"]), 1);
    expect(metadata.openGraph).toMatchObject({
      title: "Коти в добрі руки – Бровари | Opika",
      description: metadata.description,
      siteName: "Opika",
      locale: "uk_UA",
    });
    expect(metadata.twitter).toMatchObject({
      title: "Коти в добрі руки – Бровари | Opika",
      description: metadata.description,
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
