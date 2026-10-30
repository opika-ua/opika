import type { GalleryFacetCounts } from "@opika/contracts";
import { CityIdSchema, type FeedFilters, NO_FILTERS } from "@opika/domain";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GalleryFilterDropdowns } from "./GalleryFilterDropdowns";
import { placeBookOf } from "./place-book";
import {
  cityLabel,
  facetCity,
  KYIV_OBL,
  LVIV_OBL,
  REGION_LABELS,
  REGION_VIEWS,
} from "./test-places";
import { mockAppRouter, WithMockRouter } from "./test-router";

const BROVARY = CityIdSchema.parse("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
const IRPIN = CityIdSchema.parse("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
const BUCHA = CityIdSchema.parse("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee");
const LVIV = CityIdSchema.parse("dddddddd-dddd-4ddd-8ddd-dddddddddddd");
const BROVARY_L = cityLabel(BROVARY, "brovary", "Бровари");
const IRPIN_L = cityLabel(IRPIN, "irpin", "Ірпінь");
const BUCHA_L = cityLabel(BUCHA, "bucha", "Буча");
const LVIV_L = cityLabel(LVIV, "lviv", "Львів", LVIV_OBL);
const SLUGS = placeBookOf(REGION_VIEWS, [BROVARY_L, IRPIN_L, BUCHA_L, LVIV_L]).slugs;
const COUNTS: GalleryFacetCounts = {
  // Ірпінь and Бровари tie, so the alphabet decides; Буча has animals but none under these filters.
  cities: [facetCity(IRPIN_L, 14), facetCity(BROVARY_L, 14), facetCity(BUCHA_L, 0)],
  regions: [{ regionId: KYIV_OBL, count: 28 }],
  ages: { baby: 1, young: 3, adult: 22, senior: 0 },
  sizes: { small: 5, medium: 2, large: 1 },
  sexes: { male: 4, female: 6, unknown: 2 },
};

function renderRow(filters: FeedFilters = NO_FILTERS, counts: GalleryFacetCounts = COUNTS) {
  const router = mockAppRouter();
  render(
    <WithMockRouter router={router}>
      <GalleryFilterDropdowns
        filters={filters}
        sort="freshest"
        citySlugs={SLUGS}
        regionLabels={REGION_LABELS}
        selectedCities={[]}
        counts={counts}
      />
      <button type="button">Поза</button>
    </WithMockRouter>,
  );
  return router;
}

const trigger = (name: string) => screen.getByRole("button", { name });
const panel = (name: string) => screen.getByRole("group", { name });
const field = (name: string) => screen.getByRole("combobox", { name });
const optionNames = () =>
  within(screen.getByRole("listbox"))
    .getAllByRole("option")
    .map((option) => option.getAttribute("aria-label"));
const pillNames = (group: HTMLElement) =>
  within(group)
    .getAllByRole("button")
    .map((pill) => pill.getAttribute("aria-label"));

describe("GalleryFilterDropdowns", () => {
  it("renders the five selectors - oblast, city, age, size, sex - after the species toggle", () => {
    renderRow();
    for (const name of ["Область", "Місто"]) {
      expect(field(name).getAttribute("aria-expanded")).toBe("false");
    }
    for (const name of ["Вік: Вік", "Розмір: Розмір", "Стать: Стать"]) {
      expect(trigger(name).getAttribute("aria-expanded")).toBe("false");
    }
    expect(screen.getByRole("group", { name: "Вид" })).toBe(screen.getByTestId("species-toggle"));
  });

  it("names the field by the dimension while nothing is chosen", () => {
    renderRow();
    expect(field("Місто").getAttribute("placeholder")).toBe("Місто");
  });

  it("names the chosen options on the field in the order they were chosen, joined by «, »", () => {
    renderRow({ ...NO_FILTERS, cities: { kind: "oneOf", values: [IRPIN, BROVARY] } });
    expect(field("Місто: Ірпінь, Бровари").getAttribute("placeholder")).toBe("Ірпінь, Бровари");
    expect(screen.getByRole("img", { name: "Вибрано: 2" }).textContent).toBe("2");
  });

  it("opens a labelled group of pills and moves focus into it", () => {
    renderRow();
    fireEvent.click(trigger("Розмір: Розмір"));

    expect(trigger("Розмір: Розмір").getAttribute("aria-expanded")).toBe("true");
    const group = panel("Розмір");
    expect(pillNames(group)).toEqual([
      "Малий, 5 тварин",
      "Середній, 2 тварини",
      "Великий, 1 тварина",
    ]);
    expect(document.activeElement).toBe(within(group).getAllByRole("button")[0]);
  });

  it("puts the count in each pill's name and on the pill itself", () => {
    renderRow();
    fireEvent.click(trigger("Вік: Вік"));
    const pill = screen.getByRole("button", { name: "Дорослий, 22 тварини" });
    expect(pill.textContent).toBe("Дорослий22");
    expect(pill.getAttribute("aria-pressed")).toBe("false");
  });

  it("orders cities by count, most first, then alphabetically, a city with none left last and disabled", () => {
    renderRow();
    fireEvent.click(field("Місто"));
    expect(optionNames()).toEqual(["Бровари, 14 тварин", "Ірпінь, 14 тварин", "Буча, 0 тварин"]);
    expect(
      screen.getByRole("option", { name: "Буча, 0 тварин" }).getAttribute("aria-disabled"),
    ).toBe("true");
  });

  it("keeps the other dimensions in their natural order whatever the counts", () => {
    renderRow();
    fireEvent.click(trigger("Стать: Стать"));
    expect(pillNames(panel("Стать"))).toEqual([
      "Хлопчик, 4 тварини",
      "Дівчинка, 6 тварин",
      "Не записано, 2 тварини",
    ]);
  });

  it("marks the chosen pill pressed", () => {
    renderRow({ ...NO_FILTERS, ages: { kind: "oneOf", values: ["young"] } });
    fireEvent.click(trigger("Вік: Молодий"));
    expect(
      screen.getByRole("button", { name: "Молодий, 3 тварини" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "Малюк, 1 тварина" }).getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("a row applies at once through the URL, and the list stays open for the next", () => {
    const router = renderRow({ ...NO_FILTERS, sizes: { kind: "oneOf", values: ["large"] } });
    fireEvent.click(field("Місто"));
    act(() => {
      fireEvent.click(screen.getByRole("option", { name: "Ірпінь, 14 тварин" }));
    });

    expect(router.replace).toHaveBeenCalledWith("/tvaryny?misto=irpin&rozmir=large", {
      scroll: false,
    });
    expect(screen.getByRole("listbox", { name: "Місто" })).toBeTruthy();
  });

  it("ignores a press on a row with nothing to find", () => {
    const router = renderRow();
    fireEvent.click(field("Місто"));
    fireEvent.click(screen.getByRole("option", { name: "Буча, 0 тварин" }));
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("keeps a chosen row with nothing to find usable, so it can be cleared", () => {
    const router = renderRow({ ...NO_FILTERS, cities: { kind: "oneOf", values: [BUCHA] } });
    fireEvent.click(field("Місто: Буча"));
    const chosen = screen.getByRole("option", { name: "Буча, 0 тварин" });

    expect(chosen.getAttribute("aria-disabled")).toBeNull();
    expect(chosen.getAttribute("aria-selected")).toBe("true");
    act(() => {
      fireEvent.click(chosen);
    });
    expect(router.replace).toHaveBeenCalledWith("/tvaryny", { scroll: false });
  });

  it("Escape closes it and returns focus to the trigger", () => {
    renderRow();
    fireEvent.click(trigger("Вік: Вік"));
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("group", { name: "Вік" })).toBeNull();
    expect(document.activeElement).toBe(trigger("Вік: Вік"));
  });

  it("the trigger closes it again", () => {
    renderRow();
    fireEvent.click(trigger("Вік: Вік"));
    fireEvent.click(trigger("Вік: Вік"));
    expect(screen.queryByRole("group", { name: "Вік" })).toBeNull();
    expect(trigger("Вік: Вік").getAttribute("aria-expanded")).toBe("false");
  });

  it("a press outside closes it; a press inside does not", () => {
    renderRow();
    fireEvent.click(trigger("Стать: Стать"));
    fireEvent.pointerDown(screen.getByRole("button", { name: "Хлопчик, 4 тварини" }));
    expect(panel("Стать")).toBeTruthy();

    fireEvent.pointerDown(screen.getByRole("button", { name: "Поза" }));
    expect(screen.queryByRole("group", { name: "Стать" })).toBeNull();
  });

  /**
   * Oleksii, on the dropdown this replaces, verbatim: "replacing chevron icon with X to clear
   * all filters [in] 1 click". Each ✕ clears only its own dimension.
   */
  it("offers a ✕ per chosen dimension that clears only that dimension", () => {
    renderRow({
      ...NO_FILTERS,
      sizes: { kind: "oneOf", values: ["large"] },
      ages: { kind: "oneOf", values: ["young"] },
      sexes: { kind: "oneOf", values: ["male"] },
    });
    expect(screen.getByRole("link", { name: "Скинути Розмір" }).getAttribute("href")).toBe(
      "/tvaryny?vik=young&stat=male",
    );
    expect(screen.getByRole("link", { name: "Скинути Вік" }).getAttribute("href")).toBe(
      "/tvaryny?rozmir=large&stat=male",
    );
    expect(screen.queryByRole("link", { name: "Скинути Місто" })).toBeNull();
  });

  it("the species toggle writes vyd=cat for the cat segment, exclusively", () => {
    renderRow({ ...NO_FILTERS, species: { kind: "oneOf", values: ["dog"] } });
    expect(screen.getByTestId("species-dog").getAttribute("aria-current")).toBe("true");
    expect(screen.getByTestId("species-cat").getAttribute("href")).toBe("/tvaryny?vyd=cat");
    expect(screen.getByTestId("species-any").getAttribute("href")).toBe("/tvaryny");
  });

  it("the species toggle marks «Усі» active when no species is chosen, and only «Усі»", () => {
    renderRow();
    expect(screen.getByTestId("species-any").getAttribute("aria-current")).toBe("true");
    expect(screen.getByTestId("species-dog").getAttribute("aria-current")).toBeNull();
    expect(screen.getByTestId("species-cat").getAttribute("aria-current")).toBeNull();
  });

  describe("the oblast field", () => {
    const TWO_REGIONS: GalleryFacetCounts = {
      ...COUNTS,
      cities: [...COUNTS.cities, facetCity(LVIV_L, 5)],
      regions: [
        { regionId: KYIV_OBL, count: 28 },
        { regionId: LVIV_OBL, count: 5 },
      ],
    };

    it("lists every oblast with counts in two groups, a zero-count one disabled in place", () => {
      renderRow(NO_FILTERS, TWO_REGIONS);
      fireEvent.click(field("Область"));
      expect(optionNames()).toEqual([
        "Київська, 28 тварин",
        "Львівська, 5 тварин",
        "АР Крим, 0 тварин",
      ]);
      expect(screen.getByRole("group", { name: "Є тварини" })).toBeTruthy();
      expect(screen.getByRole("group", { name: "Поки без тварин" })).toBeTruthy();
      expect(
        screen.getByRole("option", { name: "АР Крим, 0 тварин" }).getAttribute("aria-disabled"),
      ).toBe("true");
    });

    it("a row applies at once through the URL as `obl`, keeping the other filters", () => {
      const router = renderRow(
        { ...NO_FILTERS, sizes: { kind: "oneOf", values: ["large"] } },
        TWO_REGIONS,
      );
      fireEvent.click(field("Область"));
      act(() => {
        fireEvent.click(screen.getByRole("option", { name: "Львівська, 5 тварин" }));
      });
      expect(router.replace).toHaveBeenCalledWith("/tvaryny?obl=lvivska&rozmir=large", {
        scroll: false,
      });
    });

    it("narrows the city field to the chosen oblast's cities", () => {
      renderRow({ ...NO_FILTERS, regions: { kind: "oneOf", values: [LVIV_OBL] } }, TWO_REGIONS);
      fireEvent.click(field("Місто"));
      expect(optionNames()).toEqual(["Львів, 5 тварин"]);
    });

    it("deselecting an oblast also drops the cities that narrowed it", () => {
      const router = renderRow(
        {
          ...NO_FILTERS,
          regions: { kind: "oneOf", values: [KYIV_OBL, LVIV_OBL] },
          cities: { kind: "oneOf", values: [BROVARY, LVIV] },
        },
        TWO_REGIONS,
      );
      fireEvent.click(field("Область: Київська, Львівська"));
      act(() => {
        fireEvent.click(screen.getByRole("option", { name: "Київська, 28 тварин" }));
      });
      // Brovary narrowed Kyiv oblast and goes with it; Lviv city (its oblast still chosen) stays.
      expect(router.replace).toHaveBeenCalledWith("/tvaryny?obl=lvivska&misto=lviv", {
        scroll: false,
      });
    });

    it("offers a ✕ that clears only the oblast", () => {
      const router = renderRow({
        ...NO_FILTERS,
        regions: { kind: "oneOf", values: [KYIV_OBL] },
        sizes: { kind: "oneOf", values: ["large"] },
      });
      act(() => {
        fireEvent.click(screen.getByRole("button", { name: "Скинути Область" }));
      });
      expect(router.replace).toHaveBeenCalledWith("/tvaryny?rozmir=large", { scroll: false });
    });
  });
});
