import { describe, expect, it } from "vitest";
import {
  hromadaShort,
  isOwnRegion,
  type PlaceLabel,
  placeHint,
  placeName,
  placeText,
} from "./place";

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

describe("placeHint", () => {
  it("is null for a name that is unique in Ukraine, so a row prints no hint", () => {
    expect(placeHint(label())).toBeNull();
  });

  it("is the oblast alone where the oblast tells same-named places apart", () => {
    expect(placeHint(label({ nameScope: "unique_in_region" }))).toBe("Київська обл.");
  });

  it("adds the raion where the oblast does not, and falls back to the oblast without one", () => {
    expect(placeHint(label({ nameScope: "unique_in_district", raion: "Броварський район" }))).toBe(
      "Броварський р-н, Київська обл.",
    );
    expect(placeHint(label({ nameScope: "unique_in_district", raion: null }))).toBe(
      "Київська обл.",
    );
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

describe("tail stripping on any whitespace, in linear time", () => {
  const hint = (raion: string) =>
    placeHint(label({ nameScope: "shared_in_district", raion, regionShort: "Київська обл." }));

  it("shortens a raion; keeps one without the tail", () => {
    expect(hint("Броварський район")).toBe("Броварський р-н, Київська обл.");
    expect(hint("Броварський район")).toBe("Броварський р-н, Київська обл.");
    expect(hint("Броварський 	  район")).toBe("Броварський р-н, Київська обл.");
    expect(hint("Броварський район ")).toBe("Броварський район , Київська обл.");
    expect(hint("Броварськийрайон")).toBe("Броварськийрайон, Київська обл.");
  });

  it("shortens a hromada across tabs, runs of spaces and U+00A0; no whitespace, no match", () => {
    expect(hromadaShort("Броварська	міська   територіальна громада")).toBe("Броварська громада");
    expect(hromadaShort("Броварська міська територіальна громада ")).toBe(
      "Броварська міська територіальна громада ",
    );
    expect(hromadaShort("Броварськаміська територіальна громада")).toBe(
      "Броварськаміська територіальна громада",
    );
    expect(hromadaShort("Броварська міська територіальнагромада")).toBe(
      "Броварська міська територіальнагромада",
    );
  });

  it("finishes a hostile 64 KB whitespace input in under 50 ms", () => {
    const hostile = " ".repeat(64 * 1024);
    const start = performance.now();
    expect(hint(`${hostile}x`)).toBe("x, Київська обл.".replace("x", `${hostile}x`));
    expect(hromadaShort(`а${hostile}міська${hostile}територіальна${hostile}x`)).toContain("а");
    expect(hromadaShort(`${hostile}міська${hostile}територіальна`)).toContain("територіальна");
    expect(performance.now() - start).toBeLessThan(50);
  });
});

describe("a city that is its own region", () => {
  const kyiv = label({
    kind: "special_status_city",
    name: "Київ",
    regionShort: "м. Київ",
    raion: null,
  });
  const sevastopol = label({
    kind: "special_status_city",
    name: "Севастополь",
    regionShort: "м. Севастополь",
    raion: null,
  });

  it("is printed once in every context and scope, never «м. Київ, м. Київ»", () => {
    for (const place of [kyiv, sevastopol]) {
      const once = `м. ${place.name}`;
      for (const nameScope of [
        "unique_in_ukraine",
        "unique_in_region",
        "unique_in_district",
        "shared_in_district",
      ] as const) {
        for (const context of ["card", "full", "address"] as const) {
          expect(placeText({ ...place, nameScope }, context)).toBe(once);
        }
        expect(placeName({ ...place, nameScope })).toBe(place.name);
        expect(placeHint({ ...place, nameScope })).toBeNull();
      }
    }
  });

  it("is told by the printed name too, when its kind was stored as a plain city", () => {
    const plain = { ...kyiv, kind: "city" as const, nameScope: "unique_in_region" as const };
    expect(isOwnRegion(plain)).toBe(true);
    expect(placeText(plain, "address")).toBe("м. Київ");
  });

  it("an ordinary city and its oblast keep both, on an address line even when unique", () => {
    const lviv = label({ name: "Львів", regionShort: "Львівська обл.", raion: "Львівський район" });
    expect(isOwnRegion(lviv)).toBe(false);
    expect(placeText(lviv, "address")).toBe("м. Львів, Львівська обл.");
    expect(placeText(lviv, "full")).toBe("м. Львів");
  });

  it("a settlement whose name merely contains the region's keeps the region", () => {
    const village = label({
      kind: "village",
      name: "Новий Київ",
      nameScope: "unique_in_region",
      regionShort: "м. Київ",
    });
    expect(isOwnRegion(village)).toBe(false);
    expect(placeText(village)).toBe("с. Новий Київ, м. Київ");
    const named = label({
      name: "Київське",
      nameScope: "unique_in_region",
      regionShort: "Київська обл.",
    });
    expect(placeText(named)).toBe("м. Київське, Київська обл.");
    expect(placeHint(named)).toBe("Київська обл.");
  });

  it("copes with a missing oblast: nothing to repeat, nothing invented", () => {
    const noRegion = label({ regionShort: "" });
    expect(isOwnRegion(noRegion)).toBe(false);
    expect(placeText(noRegion)).toBe("м. Бровари");
  });
});
