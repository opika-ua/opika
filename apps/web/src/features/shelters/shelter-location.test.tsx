import type { CityLabelView } from "@opika/contracts";
import { NO_FILTERS } from "@opika/domain";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WithMockRouter } from "../gallery/test-router";
import { ShelterPageScreen } from "./ShelterPageScreen";
import { loadShelterPage } from "./shelter-page-load";
import { CITY_ID, SHELTER_ID, stubShelterPageClient } from "./test-fixtures";

const FIRST_PAGE = { sort: "freshest", page: 1, filters: NO_FILTERS } as const;

const city = (overrides: Partial<CityLabelView>): CityLabelView => ({
  id: CITY_ID as CityLabelView["id"],
  slug: "brovary" as CityLabelView["slug"],
  kind: "city",
  nameScope: "unique_in_ukraine",
  regionId: "11111111-1111-4111-8111-111111111111" as CityLabelView["regionId"],
  name: "Бровари",
  regionShort: "Київська обл.",
  raion: "Броварський район",
  ...overrides,
});

/** Loads the shelter page for a shelter in `place` and renders it: the line a visitor reads. */
async function locationLineOf(place: CityLabelView) {
  const { client } = stubShelterPageClient({ kind: "answer" }, undefined, place);
  const load = await loadShelterPage(SHELTER_ID, FIRST_PAGE, client);
  if (load.kind !== "shelter") throw new Error("expected the shelter page");
  render(
    <WithMockRouter>
      <ShelterPageScreen {...load.view} />
    </WithMockRouter>,
  );
  return load.view.cityPlace;
}

afterEach(cleanup);

describe("the shelter page's location line", () => {
  it("names the oblast once for an ordinary city", async () => {
    expect(await locationLineOf(city({}))).toBe("м. Бровари, Київська обл.");
    expect(screen.getByText("м. Бровари, Київська обл.")).toBeTruthy();
  });

  it("shows Kyiv once, whether or not its name is unique in Ukraine", async () => {
    for (const nameScope of ["unique_in_ukraine", "unique_in_region"] as const) {
      cleanup();
      const line = await locationLineOf(
        city({ kind: "special_status_city", name: "Київ", regionShort: "м. Київ", nameScope }),
      );
      expect(line).toBe("м. Київ");
      expect(screen.getByText("м. Київ")).toBeTruthy();
      expect(screen.queryByText(/м\. Київ, м\. Київ/)).toBeNull();
    }
  });
});
