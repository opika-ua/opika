import { describe, expect, it } from "vitest";
import { placeQueryOf, searchLatinOf, searchNameOf } from "./place-search";

describe("search keys", () => {
  it("lowercases, removes apostrophes of every kind, and folds ґ for the Cyrillic key", () => {
    expect(searchNameOf("Камʼянка")).toBe("камянка");
    expect(searchNameOf("Кам'янка")).toBe("камянка");
    expect(searchNameOf("Кам’янка")).toBe("камянка");
    expect(searchNameOf("Ґанки")).toBe("ганки");
    expect(searchLatinOf("Ґанки")).toBe("ganky");
  });

  it("collapses spaces, hyphens and dashes to one space", () => {
    expect(searchNameOf("Івано-Франківськ")).toBe("івано франківськ");
    expect(searchNameOf("Івано–Франківськ")).toBe("івано франківськ");
    expect(searchNameOf("  Біла   Церква ")).toBe("біла церква");
    expect(searchLatinOf("Івано-Франківськ")).toBe("ivano frankivsk");
  });

  it("strips a leading settlement-kind word but not one inside the name", () => {
    expect(searchNameOf("м. Бровари")).toBe("бровари");
    expect(searchNameOf("с-ще Нове")).toBe("нове");
    expect(searchNameOf("смт Нове")).toBe("нове");
    expect(searchNameOf("село Нове")).toBe("нове");
    expect(searchNameOf("с.Нове")).toBe("нове");
    expect(searchNameOf("Нове Село")).toBe("нове село");
    expect(searchNameOf("Місто")).toBe("місто");
  });

  it("keeps the seeded names' keys exactly (the migration backfills these literals)", () => {
    expect(searchNameOf("Біла Церква")).toBe("біла церква");
    expect(searchLatinOf("Біла Церква")).toBe("bila tserkva");
    expect(searchLatinOf("Вишгород")).toBe("vyshhorod");
  });
});

describe("placeQueryOf", () => {
  it("refuses a query shorter than two characters after normalising", () => {
    expect(placeQueryOf("")).toEqual({ kind: "too_short" });
    expect(placeQueryOf("б")).toEqual({ kind: "too_short" });
    expect(placeQueryOf("м. ")).toEqual({ kind: "too_short" });
    expect(placeQueryOf("' ")).toEqual({ kind: "too_short" });
  });

  it("builds a Cyrillic and a Latin key from a Cyrillic query", () => {
    expect(placeQueryOf("М. Бровари")).toEqual({
      kind: "ok",
      cyrillic: "бровари",
      latin: "brovary",
    });
  });

  it("matches a Latin query against the Latin key only", () => {
    expect(placeQueryOf("Bila Tserkva")).toEqual({
      kind: "ok",
      cyrillic: null,
      latin: "bila tserkva",
    });
  });

  it("builds the same key a stored name has, for the same text", () => {
    const query = placeQueryOf("Івано-Франківськ");
    expect(query).toEqual({
      kind: "ok",
      cyrillic: searchNameOf("Івано-Франківськ"),
      latin: searchLatinOf("Івано-Франківськ"),
    });
  });
});
