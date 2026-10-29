import { describe, expect, it } from "vitest";
import { hromadaShort, type PlaceLabel, placeName, placeText } from "./place";

const label = (overrides: Partial<PlaceLabel> = {}): PlaceLabel => ({
  name: "Бровари",
  kind: "city",
  nameScope: "unique_in_ukraine",
  regionShort: "Київська обл.",
  raion: "Броварський район",
  ...overrides,
});

describe("placeText", () => {
  it("prefixes by settlement kind", () => {
    expect(placeText(label())).toBe("м. Бровари");
    expect(placeText(label({ kind: "special_status_city", name: "Київ" }))).toBe("м. Київ");
    expect(placeText(label({ kind: "selyshche", name: "Чабани" }))).toBe("с-ще Чабани");
    expect(placeText(label({ kind: "village", name: "Гора" }))).toBe("с. Гора");
  });

  it("adds the oblast on a card when the name is not unique in Ukraine, and only then", () => {
    const village = label({ kind: "village", name: "Миколаївка", regionShort: "Одеська обл." });
    expect(placeText({ ...village, nameScope: "unique_in_ukraine" })).toBe("с. Миколаївка");
    for (const nameScope of [
      "unique_in_region",
      "unique_in_district",
      "shared_in_district",
    ] as const) {
      expect(placeText({ ...village, nameScope })).toBe("с. Миколаївка, Одеська обл.");
    }
  });

  it("adds the raion on a full line when the name repeats inside its oblast", () => {
    const village = label({
      kind: "village",
      name: "Миколаївка",
      regionShort: "Одеська обл.",
      raion: "Березівський район",
    });
    expect(placeText({ ...village, nameScope: "unique_in_region" }, "full")).toBe(
      "с. Миколаївка, Одеська обл.",
    );
    expect(placeText({ ...village, nameScope: "unique_in_district" }, "full")).toBe(
      "с. Миколаївка, Березівський р-н, Одеська обл.",
    );
    expect(placeText({ ...village, nameScope: "shared_in_district" }, "full")).toBe(
      "с. Миколаївка, Березівський р-н, Одеська обл.",
    );
  });

  it("falls back to the oblast when a repeated name has no raion on record", () => {
    expect(placeText(label({ nameScope: "unique_in_district", raion: null }), "full")).toBe(
      "м. Бровари, Київська обл.",
    );
  });
});

describe("placeName", () => {
  it("is the bare name, with the oblast only where the name is ambiguous", () => {
    expect(placeName(label())).toBe("Бровари");
    expect(placeName(label({ nameScope: "unique_in_region" }))).toBe("Бровари, Київська обл.");
  });
});

describe("hromadaShort", () => {
  it("drops the kind and the «територіальна» tail", () => {
    expect(hromadaShort("Броварська міська територіальна громада")).toBe("Броварська громада");
    expect(hromadaShort("Чабанівська селищна територіальна громада")).toBe("Чабанівська громада");
    expect(hromadaShort("Гірська сільська територіальна громада")).toBe("Гірська громада");
  });

  it("keeps a name that does not end that way", () => {
    expect(hromadaShort("Броварська громада")).toBe("Броварська громада");
  });
});
