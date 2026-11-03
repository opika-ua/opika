import type { FeedCardView } from "@opika/contracts";
import type { Freshness } from "@opika/domain";
import { freshnessLabel } from "@opika/ui";
import { describe, expect, it } from "vitest";
import { cardAccessibleName, cardFactsParts, housingCityLabel, isReserved } from "./card-text";

const FRESHNESS: Freshness = {
  kind: "fresh",
  ageDays: 3,
  confirmedAt: new Date("2026-08-03T00:00:00Z"),
};

function makeCard(overrides: Partial<FeedCardView> = {}): FeedCardView {
  return {
    id: "00000001-0000-4000-8000-000000000000" as FeedCardView["id"],
    name: "Мурчик",
    species: "cat",
    sex: "male",
    size: "small",
    ageBucket: "young",
    publicLocation: null,
    primaryPhoto: null,
    freshness: FRESHNESS,
    listingKind: "published",
    shelter: {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" as FeedCardView["shelter"]["id"],
      displayName: "Тестовий притулок",
      logo: null,
      publicLocation: { cityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as never },
      freshnessSentence: null,
      verification: "verified",
    },
    ...overrides,
  } as FeedCardView;
}

describe("isReserved", () => {
  it("is false for published, true for reserved", () => {
    expect(isReserved("published")).toBe(false);
    expect(isReserved("reserved")).toBe(true);
  });
});

describe("housingCityLabel", () => {
  it("reads the place as given for an animal at its shelter (publicLocation null)", () => {
    const card = makeCard({ publicLocation: null });
    expect(housingCityLabel(card, "м. Бровари")).toBe("м. Бровари");
  });

  it("reads the fostered sentence for an animal with its own city-precision location", () => {
    const card = makeCard({
      publicLocation: { cityId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as never },
    });
    expect(housingCityLabel(card, "м. Ірпінь")).toBe("на перетримці, м. Ірпінь");
  });

  it("degrades to null, not a broken template, when the city name hasn't resolved", () => {
    expect(housingCityLabel(makeCard(), null)).toBeNull();
  });

  it("prints a city name carrying replacement patterns ($&, $1) literally", () => {
    expect(housingCityLabel(makeCard({ publicLocation: null }), "м. Місто $& $1")).toBe(
      "м. Місто $& $1",
    );
  });
});

describe("cardFactsParts", () => {
  it("lists sex, age and size as separate parts, in that order", () => {
    const card = makeCard({ sex: "male", ageBucket: "young", size: "small" });
    expect(cardFactsParts(card)).toEqual(["Хлопчик", "молодий", "малий"]);
  });

  it("is the shared formatter's line (full table in animal-labels.test.ts)", () => {
    const card = makeCard({ sex: "female", ageBucket: "adult", size: "large" });
    expect(cardFactsParts(card)).toEqual(["Дівчинка", "доросла", "велика"]);
  });

  it("drops the sex part for an unknown sex rather than guessing", () => {
    const card = makeCard({ sex: "unknown", ageBucket: "adult", size: "large" });
    expect(cardFactsParts(card)).toEqual(["Дорослий", "великий"]);
  });

  it("never mentions the city - city stays in the accessible name only", () => {
    const card = makeCard({
      publicLocation: { cityId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as never },
    });
    expect(cardFactsParts(card).join(" ")).not.toContain("перетримці");
  });
});

describe("cardAccessibleName", () => {
  it("stays age-only: no sex word and no size word (UX-2 decision 4)", () => {
    const card = makeCard({ sex: "female", ageBucket: "adult", size: "large" });
    const name = cardAccessibleName(card, "Бровари");
    expect(name).toContain("доросла");
    expect(name).not.toMatch(/Дівчинка|велика/);
  });

  it("composes name, age, city, then the freshness sentence - docs/design/README.md 'Keyboard'", () => {
    const card = makeCard({ name: "Мурчик", ageBucket: "young" });
    const expected = `Мурчик, молодий, Бровари, ${freshnessLabel(FRESHNESS)}`;
    expect(cardAccessibleName(card, "Бровари")).toBe(expected);
  });

  it("inserts the reserved badge text right after the name", () => {
    const card = makeCard({ name: "Мурчик", listingKind: "reserved" });
    const name = cardAccessibleName(card, "Бровари");
    expect(name.startsWith("Мурчик, Уже домовляються, ")).toBe(true);
  });

  it("never mentions the reserved badge for a published animal", () => {
    const card = makeCard({ listingKind: "published" });
    expect(cardAccessibleName(card, "Бровари")).not.toContain("домовляються");
  });

  it("omits city cleanly when it hasn't resolved", () => {
    const card = makeCard({ name: "Мурчик", ageBucket: "young" });
    expect(cardAccessibleName(card, null)).toBe(`Мурчик, молодий, ${freshnessLabel(FRESHNESS)}`);
  });
});
