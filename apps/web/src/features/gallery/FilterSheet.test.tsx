import type { GalleryFacetCounts } from "@opika/contracts";
import { type FeedFilters, NO_FILTERS } from "@opika/domain";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FilterSheet } from "./FilterSheet";
import {
  BROVARY,
  BROVARY_LABEL,
  COUNTS,
  facetCity,
  KYIV_LABEL,
  KYIV_OBL,
  LVIV_LABEL,
  LVIV_OBL,
  PLACE_BOOK,
  REGION_LABELS,
} from "./test-places";
import { mockAppRouter, WithMockRouter } from "./test-router";

/**
 * The dialog is never opened with `showModal()` here (these tests exercise the form and the
 * drill-down, not the open/close mechanics), and content in a closed `<dialog>` is correctly left
 * out of the accessibility tree, so role queries need `hidden: true`.
 */
const facet = (label: string) => new RegExp(`^${label}, `);

const TWO_REGIONS: GalleryFacetCounts = {
  ...COUNTS,
  cities: [facetCity(BROVARY_LABEL, 4), facetCity(KYIV_LABEL, 9), facetCity(LVIV_LABEL, 3)],
  regions: [
    { regionId: KYIV_OBL, count: 13 },
    { regionId: LVIV_OBL, count: 3 },
  ],
};

const props = (
  filters: FeedFilters,
  sort: "freshest" | "longest_waiting",
  counts: GalleryFacetCounts,
  resultCount: number,
) => ({
  filters,
  sort,
  placeIds: PLACE_BOOK.placeIds,
  citySlugs: PLACE_BOOK.slugs,
  regionLabels: REGION_LABELS,
  selectedCities: [],
  resultCount,
  counts,
});

function renderSheet(
  filters: FeedFilters = NO_FILTERS,
  sort: "freshest" | "longest_waiting" = "freshest",
  counts: GalleryFacetCounts = TWO_REGIONS,
) {
  const router = mockAppRouter();
  const { rerender } = render(
    <WithMockRouter router={router}>
      <FilterSheet {...props(filters, sort, counts, 12)} />
    </WithMockRouter>,
  );
  const applyFromElsewhere = (next: FeedFilters) =>
    rerender(
      <WithMockRouter router={router}>
        <FilterSheet {...props(next, sort, counts, 3)} />
      </WithMockRouter>,
    );
  return { router, applyFromElsewhere };
}

const sheet = () => within(screen.getByTestId("filter-sheet"));
const submit = () => sheet().getByRole("button", { name: /^Показати/, hidden: true });
const hrefOf = (router: ReturnType<typeof mockAppRouter>) =>
  new URL((router.replace.mock.calls[0] as [string])[0], "http://x");
const openDrill = (name: string) => {
  fireEvent.click(sheet().getByRole("button", { name, hidden: true }));
};
const checklistNames = () =>
  sheet()
    .getAllByRole("checkbox", { hidden: true })
    .filter((box) => box.tagName === "BUTTON")
    .map((box) => box.getAttribute("aria-label"));

describe("FilterSheet: the main screen", () => {
  it("names its trigger «Фільтри»", () => {
    renderSheet();
    expect(screen.getByTestId("filter-sheet-trigger").getAttribute("aria-label")).toBe("Фільтри");
  });

  it("counts the active filters in the trigger's accessible name and badge", () => {
    renderSheet({
      ...NO_FILTERS,
      sizes: { kind: "oneOf", values: ["small"] },
      ages: { kind: "oneOf", values: ["young", "adult"] },
    });
    const trigger = screen.getByTestId("filter-sheet-trigger");
    expect(trigger.getAttribute("aria-label")).toBe("Фільтри, Активних фільтрів: 3");
    expect(trigger.textContent).toBe("Фільтри3");
  });

  it("shows Область and Місто as rows with «Усі» while nothing is chosen, and no pill wall", () => {
    renderSheet();
    expect(sheet().getByRole("button", { name: "Область, Усі", hidden: true })).toBeTruthy();
    expect(sheet().getByRole("button", { name: "Місто, Усі", hidden: true })).toBeTruthy();
    expect(sheet().queryByRole("group", { name: "Місто", hidden: true })).toBeNull();
  });

  it("shows the chosen names on the row", () => {
    renderSheet({ ...NO_FILTERS, regions: { kind: "oneOf", values: [KYIV_OBL] } });
    expect(sheet().getByRole("button", { name: "Область, Київська", hidden: true })).toBeTruthy();
  });

  it("labels the apply button with the count and the accusative plural", () => {
    renderSheet();
    expect(submit().textContent).toBe("Показати 12 тварин");
  });

  it("checks only the explicitly-selected box", () => {
    renderSheet({ ...NO_FILTERS, sizes: { kind: "oneOf", values: ["small"] } });
    const s = sheet();
    expect((s.getByLabelText(facet("Малий")) as HTMLInputElement).checked).toBe(true);
    expect((s.getByLabelText(facet("Середній")) as HTMLInputElement).checked).toBe(false);
  });

  it("submitting with two boxes checked in one group sends both", () => {
    const { router } = renderSheet();
    fireEvent.click(sheet().getByLabelText(facet("Малий")));
    fireEvent.click(sheet().getByLabelText(facet("Середній")));
    fireEvent.click(submit());

    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(hrefOf(router).searchParams.get("rozmir")).toBe("medium,small");
  });

  it("submitting with the default sort omits the sort param", () => {
    const { router } = renderSheet();
    fireEvent.click(submit());
    expect((router.replace.mock.calls[0] as [string])[0]).not.toContain("sort=");
  });

  it("carries the species and the sort, which have controls of their own on the page", () => {
    const { router } = renderSheet(
      { ...NO_FILTERS, species: { kind: "oneOf", values: ["dog"] } },
      "longest_waiting",
    );
    fireEvent.click(submit());
    const params = hrefOf(router).searchParams;
    expect(params.get("vyd")).toBe("dog");
    expect(params.get("sort")).toBe("longest_waiting");
  });

  it("has «Стать»: ticking «Дівчинка» submits `stat=female`", () => {
    const { router } = renderSheet();
    const group = within(sheet().getByRole("group", { name: "Стать", hidden: true }));
    expect(group.getAllByRole("checkbox", { hidden: true })).toHaveLength(3);
    fireEvent.click(group.getByLabelText(facet("Дівчинка")));
    fireEvent.click(submit());
    expect(hrefOf(router).searchParams.get("stat")).toBe("female");
  });

  it("«Скинути» replaces with every filter cleared, sort preserved", () => {
    const { router } = renderSheet(
      { ...NO_FILTERS, species: { kind: "oneOf", values: ["dog"] } },
      "longest_waiting",
    );
    fireEvent.click(screen.getByRole("link", { name: "Скинути", hidden: true }));
    expect(router.replace).toHaveBeenCalledWith("/tvaryny?sort=longest_waiting", {
      scroll: false,
    });
  });

  it("names each facet pill with its count, pluralised", () => {
    renderSheet();
    const s = sheet();
    expect(s.getByLabelText("Малий, 1 тварина")).toBeTruthy();
    expect(s.getByLabelText("Середній, 3 тварини")).toBeTruthy();
    expect(s.getByLabelText("Великий, 5 тварин")).toBeTruthy();
  });

  it("disables an option with nothing to find, unless it is ticked and must stay clearable", () => {
    renderSheet({ ...NO_FILTERS, sizes: { kind: "oneOf", values: ["large"] } }, "freshest", {
      ...COUNTS,
      sizes: { small: 0, medium: 2, large: 0 },
    });
    const s = sheet();
    expect((s.getByLabelText("Малий, 0 тварин") as HTMLInputElement).disabled).toBe(true);
    const ticked = s.getByLabelText("Великий, 0 тварин") as HTMLInputElement;
    expect(ticked.checked).toBe(true);
    expect(ticked.disabled).toBe(false);
  });

  it("a ticked box does not survive a filter change that came from somewhere else", () => {
    const { applyFromElsewhere } = renderSheet();
    fireEvent.click(sheet().getByLabelText(facet("Малий")));
    expect((sheet().getByLabelText(facet("Малий")) as HTMLInputElement).checked).toBe(true);

    applyFromElsewhere({ ...NO_FILTERS, sizes: { kind: "oneOf", values: ["large"] } });

    expect((sheet().getByLabelText(facet("Малий")) as HTMLInputElement).checked).toBe(false);
    expect((sheet().getByLabelText(facet("Великий")) as HTMLInputElement).checked).toBe(true);
  });

  it("discards unsaved ticks and drill-down choices when the dialog closes", () => {
    renderSheet();
    fireEvent.click(sheet().getByLabelText(facet("Малий")));
    openDrill("Область, Усі");
    fireEvent.click(sheet().getByRole("checkbox", { name: "Львівська, 3 тварини", hidden: true }));

    act(() => {
      fireEvent(screen.getByTestId("filter-sheet"), new Event("close"));
    });

    expect((sheet().getByLabelText(facet("Малий")) as HTMLInputElement).checked).toBe(false);
    expect(sheet().getByRole("button", { name: "Область, Усі", hidden: true })).toBeTruthy();
  });
});

describe("FilterSheet: the Область / Місто screens", () => {
  it("opens a screen titled by the dimension, with a search field that is not focused", () => {
    renderSheet();
    openDrill("Область, Усі");
    expect(sheet().getByRole("heading", { name: "Область", hidden: true })).toBeTruthy();
    const search = sheet().getByRole("searchbox", { name: "Пошук області", hidden: true });
    expect(document.activeElement).not.toBe(search);
    expect(sheet().getByRole("button", { name: "Назад", hidden: true })).toBeTruthy();
  });

  it("lists all oblasts in two groups, the empty ones disabled", () => {
    renderSheet();
    openDrill("Область, Усі");
    expect(checklistNames()).toEqual([
      "Київська, 13 тварин",
      "Львівська, 3 тварини",
      "АР Крим, 0 тварин",
    ]);
    const crimea = sheet().getByRole("checkbox", { name: "АР Крим, 0 тварин", hidden: true });
    expect((crimea as HTMLButtonElement).disabled).toBe(true);
    expect(sheet().getByRole("group", { name: "Є тварини", hidden: true })).toBeTruthy();
    expect(sheet().getByRole("group", { name: "Поки без тварин", hidden: true })).toBeTruthy();
  });

  it("filters as you type, and says so when nothing matches (the city hint only for Місто)", () => {
    renderSheet();
    openDrill("Місто, Усі");
    const search = sheet().getByRole("searchbox", { name: "Пошук міста", hidden: true });
    fireEvent.change(search, { target: { value: "бр" } });
    expect(checklistNames()).toEqual(["Бровари, 4 тварини"]);

    fireEvent.change(search, { target: { value: "одес" } });
    expect(sheet().getByText("Нічого не знайдено")).toBeTruthy();
    expect(sheet().getByText("Тут лише міста, де зараз є тварини.")).toBeTruthy();
  });

  it("keeps the choice when going back with «Готово», and submits it as `obl`", () => {
    const { router } = renderSheet();
    openDrill("Область, Усі");
    fireEvent.click(sheet().getByRole("checkbox", { name: "Львівська, 3 тварини", hidden: true }));
    fireEvent.click(sheet().getByRole("button", { name: "Готово", hidden: true }));

    expect(sheet().getByRole("button", { name: "Область, Львівська", hidden: true })).toBeTruthy();
    // Nothing is applied until «Показати …».
    expect(router.replace).not.toHaveBeenCalled();
    fireEvent.click(submit());
    expect(hrefOf(router).searchParams.get("obl")).toBe("lvivska");
  });

  it("«Назад» returns to the main screen with the choice kept", () => {
    renderSheet();
    openDrill("Місто, Усі");
    fireEvent.click(sheet().getByRole("checkbox", { name: "Київ, 9 тварин", hidden: true }));
    fireEvent.click(sheet().getByRole("button", { name: "Назад", hidden: true }));
    expect(sheet().getByRole("button", { name: "Місто, Київ", hidden: true })).toBeTruthy();
  });

  it("«Очистити» clears the choices of that screen only", () => {
    renderSheet({
      ...NO_FILTERS,
      regions: { kind: "oneOf", values: [LVIV_OBL] },
      cities: { kind: "oneOf", values: [BROVARY] },
    });
    openDrill("Місто, Бровари");
    fireEvent.click(sheet().getByRole("button", { name: "Очистити", hidden: true }));
    fireEvent.click(sheet().getByRole("button", { name: "Готово", hidden: true }));
    expect(sheet().getByRole("button", { name: "Місто, Усі", hidden: true })).toBeTruthy();
    expect(sheet().getByRole("button", { name: "Область, Львівська", hidden: true })).toBeTruthy();
  });

  it("deselecting an oblast drops the cities that narrowed it", () => {
    const { router } = renderSheet({
      ...NO_FILTERS,
      regions: { kind: "oneOf", values: [KYIV_OBL, LVIV_OBL] },
      cities: { kind: "oneOf", values: [BROVARY] },
    });
    openDrill("Область, Київська, Львівська");
    fireEvent.click(sheet().getByRole("checkbox", { name: "Київська, 13 тварин", hidden: true }));
    fireEvent.click(sheet().getByRole("button", { name: "Готово", hidden: true }));
    fireEvent.click(submit());
    const params = hrefOf(router).searchParams;
    expect(params.get("obl")).toBe("lvivska");
    expect(params.get("misto")).toBeNull();
  });

  it("Enter in the search field does not submit the form", () => {
    renderSheet();
    openDrill("Область, Усі");
    const search = sheet().getByRole("searchbox", { name: "Пошук області", hidden: true });
    expect(fireEvent.keyDown(search, { key: "Enter" })).toBe(false);
  });
});

describe("FilterSheet: the live count and Escape", () => {
  it("follows a single-dimension draft from the facet counts", () => {
    renderSheet();
    openDrill("Область, Усі");
    fireEvent.click(sheet().getByRole("checkbox", { name: "Львівська, 3 тварини", hidden: true }));
    fireEvent.click(sheet().getByRole("button", { name: "Готово", hidden: true }));
    expect(submit().textContent).toBe("Показати 3 тварини");
  });

  it("follows ticked pills too", () => {
    renderSheet();
    fireEvent.click(sheet().getByLabelText(facet("Малий")));
    expect(submit().textContent).toBe("Показати 1 тварину");
  });

  it("drops the number, not guesses one, when two dimensions changed", () => {
    renderSheet();
    fireEvent.click(sheet().getByLabelText(facet("Малий")));
    openDrill("Область, Усі");
    fireEvent.click(sheet().getByRole("checkbox", { name: "Львівська, 3 тварини", hidden: true }));
    fireEvent.click(sheet().getByRole("button", { name: "Готово", hidden: true }));
    expect(submit().textContent).toBe("Показати результати");
  });

  it("Escape inside a drill-down returns to the main screen; on the main screen it is left to close the sheet", () => {
    renderSheet();
    openDrill("Область, Усі");
    const dialog = screen.getByTestId("filter-sheet");
    const inDrill = new Event("cancel", { cancelable: true });
    act(() => {
      dialog.dispatchEvent(inDrill);
    });
    expect(inDrill.defaultPrevented).toBe(true);
    expect(sheet().getByRole("button", { name: "Область, Усі", hidden: true })).toBeTruthy();

    const onMain = new Event("cancel", { cancelable: true });
    act(() => {
      dialog.dispatchEvent(onMain);
    });
    expect(onMain.defaultPrevented).toBe(false);
  });
});

describe("FilterSheet: without JS (the server-rendered form)", () => {
  const html = renderToStaticMarkup(
    <WithMockRouter>
      <FilterSheet {...props(NO_FILTERS, "freshest", TWO_REGIONS, 12)} />
    </WithMockRouter>,
  );
  const doc = new DOMParser().parseFromString(html, "text/html");

  it("is a GET form to the gallery", () => {
    const form = doc.querySelector("form");
    expect(form?.getAttribute("method")?.toLowerCase()).toBe("get");
    expect(form?.getAttribute("action")).toBe("/tvaryny");
  });

  it("falls back to submittable checkboxes for the oblasts, cities, ages", () => {
    expect(doc.querySelectorAll('input[type="checkbox"][name="obl"]').length).toBe(3);
    expect(doc.querySelectorAll('input[type="checkbox"][name="misto"]').length).toBeGreaterThan(0);
    expect(doc.querySelectorAll('input[type="checkbox"][name="vik"]').length).toBe(4);
  });

  it("carries the species and the sort as hidden inputs", () => {
    expect(doc.querySelector('input[type="hidden"][name="vyd"]')).not.toBeNull();
    expect(doc.querySelector('input[type="hidden"][name="sort"]')?.getAttribute("value")).toBe(
      "freshest",
    );
  });

  it("has a real submit button", () => {
    expect(doc.querySelector('button[type="submit"]')?.textContent).toBe("Показати 12 тварин");
  });
});
