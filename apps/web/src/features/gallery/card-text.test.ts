import type { FeedCardView } from "@opika/contracts";
import type { Freshness } from "@opika/domain";
import { freshnessLabel } from "@opika/ui";
import { describe, expect, it } from "vitest";
import { cardAccessibleName, cardMetaLine, housingCityLabel, isReserved } from "./card-text";

const FRESHNESS: Freshness = {
  kind: "fresh",
  ageDays: 3,
  updatedAt: new Date("2026-08-03T00:00:00Z"),
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
      publicLocation: {
        precision: "fuzzed_address",
        cityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as never,
        district: null,
        approximate: { center: { lat: 50.45, lng: 30.52 }, precisionMetres: 1000 } as never,
      },
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
  it("reads 'м. {city}' for an animal at its shelter (publicLocation null)", () => {
    const card = makeCard({ publicLocation: null });
    expect(housingCityLabel(card, "Бровари")).toBe("м. Бровари");
  });

  it("reads the fostered sentence for an animal with its own city-precision location", () => {
    const card = makeCard({
      publicLocation: {
        precision: "city",
        cityId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as never,
        district: null,
      },
    });
    expect(housingCityLabel(card, "Ірпінь")).toBe("живе у волонтерки, м. Ірпінь");
  });

  it("degrades to null, not a broken template, when the city name hasn't resolved", () => {
    expect(housingCityLabel(makeCard(), null)).toBeNull();
  });
});

describe("cardMetaLine", () => {
  it("joins age, size and housing+city with the deck's own separator", () => {
    const card = makeCard({ ageBucket: "young", size: "small", publicLocation: null });
    expect(cardMetaLine(card, "Бровари")).toBe("молодий · мала · м. Бровари");
  });

  it("drops the housing+city segment rather than leaving a dangling separator", () => {
    const card = makeCard({ ageBucket: "adult", size: "large" });
    expect(cardMetaLine(card, null)).toBe("дорослий · велика");
  });
});

describe("cardAccessibleName", () => {
  it("composes name, age, city, then the freshness sentence — docs/design/README.md 'Keyboard'", () => {
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
