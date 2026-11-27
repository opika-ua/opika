import type { ListedShelterView } from "@opika/contracts";
import { CityIdSchema, ShelterIdSchema } from "@opika/domain";
import { describe, expect, it } from "vitest";
import { listedCountsOf } from "../../api/handlers/shelters";
import { BROVARY, BROVARY_LABEL, KYIV, KYIV_LABEL } from "../gallery/test-places";
import { groupByCity } from "./shelters-index-load";

const UNLABELLED = CityIdSchema.parse("cccccccc-cccc-4ccc-8ccc-cccccccccccc");
const shelterId = (n: number) => ShelterIdSchema.parse(`5${n}000000-0000-4000-8000-000000000000`);

const listed = (n: number, displayName: string, cityId = BROVARY): ListedShelterView => ({
  id: shelterId(n),
  displayName,
  logo: null,
  createdAt: new Date("2025-03-01T00:00:00.000Z"),
  publicLocation: { cityId },
  organisationWord: "shelter",
  listedAnimalCount: 1,
});

describe("groupByCity: the shelters list's order (no ranking input, commitment 1)", () => {
  it("groups by the shelter's own city, cities and names in Ukrainian order, an unlabelled city last", () => {
    const groups = groupByCity(
      [
        listed(1, "Ялинка", BROVARY),
        listed(2, "Без міста", UNLABELLED),
        listed(3, "Єнот", KYIV),
        listed(4, "Ґава", BROVARY),
        listed(5, "Іскра", BROVARY),
      ],
      [BROVARY_LABEL, KYIV_LABEL],
      new Set([KYIV]),
    );
    expect(
      groups.map((group) => [
        group.cityName,
        group.cityHref,
        group.shelters.map((s) => s.displayName),
      ]),
    ).toEqual([
      ["Бровари", null, ["Ґава", "Іскра", "Ялинка"]],
      ["Київ", "/tvaryny/misto/kyiv", ["Єнот"]],
      [null, null, ["Без міста"]],
    ]);
  });
});

describe("listedCountsOf: each shelter's count from the sitemap's animal rows", () => {
  it("counts each shelter's rows", () => {
    const counts = listedCountsOf([
      { shelterId: shelterId(1) },
      { shelterId: shelterId(2) },
      { shelterId: shelterId(1) },
    ]);
    expect([...counts]).toEqual([
      [shelterId(1), 2],
      [shelterId(2), 1],
    ]);
  });
});
