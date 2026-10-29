import type { CityLabelView, GalleryFacetCounts } from "@opika/contracts";
import { CityIdSchema, type FeedFilters, NO_FILTERS } from "@opika/domain";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FilterSheet } from "./FilterSheet";
import { GalleryFilterDropdowns } from "./GalleryFilterDropdowns";
import { placeBookOf } from "./place-book";
import { cityLabel, facetCity, REGION_LABELS, REGION_VIEWS } from "./test-places";
import { mockAppRouter, WithMockRouter } from "./test-router";

/** Fifteen cities with an animal each, "Місто 01" first (most animals), so the order is fixed. */
const nth = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const LABELS: CityLabelView[] = Array.from({ length: 15 }, (_, i) =>
  cityLabel(
    CityIdSchema.parse(nth(i + 1)),
    `misto-${i + 1}`,
    `Місто ${String(i + 1).padStart(2, "0")}`,
  ),
);
const BOOK = placeBookOf(REGION_VIEWS, LABELS);
const countsOf = (labels: readonly CityLabelView[]): GalleryFacetCounts => ({
  cities: labels.map((label, i) => facetCity(label, 20 - i)),
  regions: [],
  ages: { baby: 0, young: 0, adult: 0, senior: 0 },
  sizes: { small: 0, medium: 0, large: 0 },
  sexes: { male: 0, female: 0, unknown: 0 },
});

function renderRow(labels = LABELS, filters: FeedFilters = NO_FILTERS) {
  const router = mockAppRouter();
  render(
    <WithMockRouter router={router}>
      <GalleryFilterDropdowns
        filters={filters}
        sort="freshest"
        citySlugs={BOOK.slugs}
        regionLabels={REGION_LABELS}
        selectedCities={[]}
        counts={countsOf(labels)}
      />
    </WithMockRouter>,
  );
  fireEvent.click(screen.getByRole("button", { name: /^Місто: / }));
  return { router, panel: screen.getByRole("group", { name: "Місто" }) };
}

const pillNames = (group: HTMLElement) =>
  within(group)
    .getAllByRole("button")
    .map((pill) => pill.getAttribute("aria-label"))
    .filter((name) => name !== null);

describe("the city filter on a long list (desktop panel)", () => {
  it("shows the first twelve, a «Показати всі (15)» button and a labelled field", () => {
    const { panel } = renderRow();
    expect(pillNames(panel)).toHaveLength(12);
    expect(pillNames(panel)[0]).toBe("Місто 01, 20 тварин");
    expect(within(panel).getByRole("button", { name: "Показати всі (15)" })).toBeTruthy();
    expect(within(panel).getByLabelText("Знайти місто")).toBeTruthy();
  });

  it("«Показати всі» draws every city with its count and goes away; the URL is untouched", () => {
    const { router, panel } = renderRow();
    fireEvent.click(within(panel).getByRole("button", { name: "Показати всі (15)" }));
    expect(pillNames(panel)).toHaveLength(15);
    expect(pillNames(panel)[14]).toBe("Місто 15, 6 тварин");
    expect(within(panel).queryByRole("button", { name: /Показати всі/ })).toBeNull();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("the field narrows the whole list locally and announces the number found", () => {
    const { router, panel } = renderRow();
    fireEvent.change(within(panel).getByLabelText("Знайти місто"), {
      target: { value: "місто 1" },
    });
    // «Місто 10» to «Місто 15» contain the query; «Місто 01» does not.
    expect(pillNames(panel)).toEqual([
      "Місто 10, 11 тварин",
      "Місто 11, 10 тварин",
      "Місто 12, 9 тварин",
      "Місто 13, 8 тварин",
      "Місто 14, 7 тварин",
      "Місто 15, 6 тварин",
    ]);
    expect(within(panel).getByRole("status").textContent).toBe("Знайдено: 6");
    expect(within(panel).queryByRole("button", { name: /Показати всі/ })).toBeNull();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("says so when nothing matches", () => {
    const { panel } = renderRow();
    fireEvent.change(within(panel).getByLabelText("Знайти місто"), { target: { value: "zzz" } });
    expect(within(panel).getByText("Нічого не знайдено")).toBeTruthy();
    expect(within(panel).getByRole("status").textContent).toBe("Знайдено: 0");
  });

  it("keeps a chosen city past the twelfth visible, pressed, while collapsed and while filtering", () => {
    const chosen = LABELS[14];
    if (!chosen) throw new Error("fixture");
    const { panel } = renderRow(LABELS, {
      ...NO_FILTERS,
      cities: { kind: "oneOf", values: [chosen.id] },
    });
    const pressed = () =>
      within(panel)
        .getByRole("button", { name: "Місто 15, 6 тварин" })
        .getAttribute("aria-pressed");
    expect(pressed()).toBe("true");
    fireEvent.change(within(panel).getByLabelText("Знайти місто"), { target: { value: "01" } });
    expect(pressed()).toBe("true");
  });

  it("has neither field nor button when the list fits in twelve", () => {
    const { panel } = renderRow(LABELS.slice(0, 12));
    expect(pillNames(panel)).toHaveLength(12);
    expect(within(panel).queryByLabelText("Знайти місто")).toBeNull();
    expect(within(panel).queryByRole("button", { name: /Показати всі/ })).toBeNull();
  });
});

describe("the city filter on a long list (filter sheet)", () => {
  function renderSheet() {
    render(
      <WithMockRouter router={mockAppRouter()}>
        <FilterSheet
          filters={NO_FILTERS}
          sort="freshest"
          placeIds={BOOK.placeIds}
          citySlugs={BOOK.slugs}
          regionLabels={REGION_LABELS}
          selectedCities={[]}
          resultCount={12}
          shelterCount={5}
          counts={countsOf(LABELS)}
        />
      </WithMockRouter>,
    );
    return screen.getByRole("group", { name: "Місто", hidden: true });
  }
  const boxes = (group: HTMLElement) => within(group).getAllByRole("checkbox", { hidden: true });

  it("lists twelve checkboxes, expands on «Показати всі», and filters with the field", () => {
    const group = renderSheet();
    expect(boxes(group)).toHaveLength(12);
    fireEvent.click(within(group).getByRole("button", { name: "Показати всі (15)", hidden: true }));
    expect(boxes(group)).toHaveLength(15);
    fireEvent.change(within(group).getByLabelText("Знайти місто"), {
      target: { value: "Місто 02" },
    });
    expect(boxes(group)).toHaveLength(1);
  });

  it("Enter in the field does not submit the filter form", () => {
    const group = renderSheet();
    const field = within(group).getByLabelText("Знайти місто");
    expect(fireEvent.keyDown(field, { key: "Enter" })).toBe(false);
  });
});
