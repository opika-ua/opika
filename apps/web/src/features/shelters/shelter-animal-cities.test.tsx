import type { CityLabelView } from "@opika/contracts";
import type { CityId } from "@opika/domain";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WithMockRouter } from "../gallery/test-router";
import { ShelterPageScreen } from "./ShelterPageScreen";
import { animalCitiesOf } from "./shelter-page-load";
import { makeShelterPageView } from "./test-fixtures";

/** «Тварини в: …» (§12.2): derived from the listed animals' effective cities, never entered. */

const label = (id: string, name: string): CityLabelView => ({
  id: id as CityLabelView["id"],
  slug: id as CityLabelView["slug"],
  kind: "city",
  nameScope: "unique_in_ukraine",
  regionId: "11111111-1111-4111-8111-111111111111" as CityLabelView["regionId"],
  name,
  regionShort: "Київська обл.",
  raion: null,
});
const KYIV = "a1";
const shelterCity = KYIV as CityId;

afterEach(cleanup);

describe("animalCitiesOf", () => {
  it("the shelter's city first, then the others in Ukrainian order", () => {
    expect(
      animalCitiesOf(shelterCity, [
        label("c3", "Ірпінь"),
        label(KYIV, "Київ"),
        label("c2", "Бровари"),
        label("c3", "Ірпінь"),
      ]),
    ).toEqual(["Київ", "Бровари", "Ірпінь"]);
  });

  it("nothing when every listed animal is in the shelter's city, or none is listed", () => {
    expect(animalCitiesOf(shelterCity, [label(KYIV, "Київ")])).toEqual([]);
    expect(animalCitiesOf(shelterCity, [])).toEqual([]);
  });

  it("a city of their own alone is still a line, without the shelter's", () => {
    expect(animalCitiesOf(shelterCity, [label("c2", "Бровари")])).toEqual(["Бровари"]);
  });
});

describe("the shelter page's «Тварини в» line", () => {
  it("shows the cities when there are several", () => {
    render(
      <WithMockRouter>
        <ShelterPageScreen {...makeShelterPageView({ animalCities: ["Київ", "Бровари"] })} />
      </WithMockRouter>,
    );
    expect(screen.getByText("Тварини в: Київ, Бровари")).toBeTruthy();
  });

  it("is absent when they are all in the shelter's city", () => {
    render(
      <WithMockRouter>
        <ShelterPageScreen {...makeShelterPageView({ animalCities: [] })} />
      </WithMockRouter>,
    );
    expect(screen.queryByText(/Тварини в:/)).toBeNull();
  });
});
