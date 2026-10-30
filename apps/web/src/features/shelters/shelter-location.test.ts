import type { CityLabelView } from "@opika/contracts";
import { describe, expect, it } from "vitest";
import { shelterLocationText } from "./shelter-page-load";

const city = (overrides: Partial<CityLabelView>): CityLabelView => ({
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as CityLabelView["id"],
  slug: "brovary" as CityLabelView["slug"],
  kind: "city",
  nameScope: "unique_in_ukraine",
  regionId: "11111111-1111-4111-8111-111111111111" as CityLabelView["regionId"],
  name: "Бровари",
  regionShort: "Київська обл.",
  raion: "Броварський район",
  ...overrides,
});

describe("shelterLocationText", () => {
  it("adds the oblast to a name that is unique in Ukraine", () => {
    expect(shelterLocationText(city({}))).toBe("м. Бровари, Київська обл.");
  });

  it("does not add it twice when the name is shared and already carries it", () => {
    const text = shelterLocationText(
      city({ nameScope: "unique_in_region", name: "Миколаївка", kind: "village" }),
    );
    expect(text.match(/Київська обл\./g)).toHaveLength(1);
  });

  it("leaves Kyiv and Sevastopol bare: their name is the region", () => {
    for (const regionId of [
      "f421e743-f9dd-5198-86bd-8a05911ec75b",
      "c45a68e7-2bf8-52b5-99ac-b10752d86025",
    ]) {
      expect(
        shelterLocationText(
          city({
            name: "Київ",
            regionId: regionId as CityLabelView["regionId"],
            regionShort: "м. Київ",
          }),
        ),
      ).toBe("м. Київ");
    }
  });
});
