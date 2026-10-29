import type { GalleryFacetCounts } from "@opika/contracts";
import { type CityId, CityIdSchema, type FeedFilters, NO_FILTERS } from "@opika/domain";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GalleryFilterDropdowns } from "./GalleryFilterDropdowns";
import { mockAppRouter, WithMockRouter } from "./test-router";

const BROVARY = CityIdSchema.parse("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
const IRPIN = CityIdSchema.parse("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
const BUCHA = CityIdSchema.parse("cccccccc-cccc-4ccc-8ccc-cccccccccccc");
const CITIES: ReadonlyArray<{ id: CityId; name: string }> = [
  { id: BROVARY, name: "Бровари" },
  { id: IRPIN, name: "Ірпінь" },
  { id: BUCHA, name: "Буча" },
];
const CITY_SLUGS = new Map<CityId, never>([
  [BROVARY, "brovary" as never],
  [IRPIN, "irpin" as never],
  [BUCHA, "bucha" as never],
]);
const COUNTS: GalleryFacetCounts = {
  // Ірпінь and Бровари tie, so the alphabet decides; Буча has none.
  cities: [
    { cityId: IRPIN, count: 14 },
    { cityId: BROVARY, count: 14 },
  ],
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
        cities={CITIES}
        citySlugs={CITY_SLUGS}
        counts={counts}
      />
      <button type="button">Поза</button>
    </WithMockRouter>,
  );
  return router;
}

const trigger = (name: string) => screen.getByRole("button", { name });
const panel = (name: string) => screen.getByRole("group", { name });
const pillNames = (group: HTMLElement) =>
  within(group)
    .getAllByRole("button")
    .map((pill) => pill.getAttribute("aria-label"));

describe("GalleryFilterDropdowns", () => {
  it("renders the four selectors - city, age, size, sex - after the species toggle", () => {
    renderRow();
    for (const name of ["Місто: Місто", "Вік: Вік", "Розмір: Розмір", "Стать: Стать"]) {
      expect(trigger(name).getAttribute("aria-expanded")).toBe("false");
    }
    expect(screen.getByTestId("species-toggle").tagName).toBe("FIELDSET");
  });

  it("names the trigger by the dimension while nothing is chosen", () => {
    renderRow();
    expect(trigger("Місто: Місто").textContent).toBe("Місто");
  });

  it("names the chosen options on the trigger in the panel's order, joined by «, »", () => {
    renderRow({ ...NO_FILTERS, cities: { kind: "oneOf", values: [IRPIN, BROVARY] } });
    // Бровари first: 14 each, then the alphabet - the order the pills have.
    expect(trigger("Місто: Бровари, Ірпінь").textContent).toBe("Бровари, Ірпінь");
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

  it("orders cities by count, most first, then alphabetically, keeping a city with none", () => {
    renderRow();
    fireEvent.click(trigger("Місто: Місто"));
    expect(pillNames(panel("Місто"))).toEqual([
      "Бровари, 14 тварин",
      "Ірпінь, 14 тварин",
      "Буча, 0 тварин",
    ]);
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

  it("a pill applies at once through the URL, and the panel stays open for the next", () => {
    const router = renderRow({ ...NO_FILTERS, sizes: { kind: "oneOf", values: ["large"] } });
    fireEvent.click(trigger("Місто: Місто"));
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Ірпінь, 14 тварин" }));
    });

    expect(router.replace).toHaveBeenCalledWith("/tvaryny?misto=irpin&rozmir=large", {
      scroll: false,
    });
    expect(panel("Місто")).toBeTruthy();
  });

  it("offers an option with nothing to find as disabled, and ignores a press on it", () => {
    const router = renderRow();
    fireEvent.click(trigger("Місто: Місто"));
    const empty = screen.getByRole("button", { name: "Буча, 0 тварин" });

    expect(empty.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(empty);
    expect(router.replace).not.toHaveBeenCalled();
    // Focus skipped it on open: the first pill that can do something has it.
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Бровари, 14 тварин" }));
  });

  it("keeps a chosen option with nothing to find usable, so it can be cleared", () => {
    const router = renderRow({ ...NO_FILTERS, cities: { kind: "oneOf", values: [BUCHA] } });
    fireEvent.click(trigger("Місто: Буча"));
    const chosen = screen.getByRole("button", { name: "Буча, 0 тварин" });

    expect(chosen.getAttribute("aria-disabled")).toBeNull();
    expect(chosen.getAttribute("aria-pressed")).toBe("true");
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
});
