import type { GalleryFacetCounts } from "@opika/contracts";
import { type FeedFilters, NO_FILTERS } from "@opika/domain";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FilterSheet } from "./FilterSheet";
import {
  BROVARY,
  BROVARY_LABEL,
  COUNTS,
  facetCity,
  KYIV,
  KYIV_LABEL,
  KYIV_OBL,
  LVIV,
  LVIV_LABEL,
  LVIV_OBL,
  PLACE_BOOK,
  REGION_LABELS,
} from "./test-places";
import { mockAppRouter, WithMockRouter } from "./test-router";

/**
 * `getByRole` for the submit button and the footer/Усі-міста links needs
 * `{ hidden: true }`: this component's `<dialog>` never has `showModal()`
 * called on it in these tests (they're exercising form-submission logic,
 * not the open/close interaction), and content inside a closed `<dialog>`
 * is correctly excluded from the accessibility tree - real accessibility
 * behaviour that `getByRole` respects by default, confirmed by dumping the
 * DOM and finding the elements present but unqueryable without the flag.
 * `getByLabelText` for the checkboxes doesn't perform the same hidden-state
 * computation, which is why those queries below don't need it.
 */

/** A facet pill's input is named with its count («Малий, 1 тварина»); match the label part. */
const facet = (label: string) => new RegExp(`^${label}, `);

function renderSheet(
  filters = NO_FILTERS,
  sort: "freshest" | "longest_waiting" = "freshest",
  counts: GalleryFacetCounts = COUNTS,
) {
  const router = mockAppRouter();
  const { rerender } = render(
    <WithMockRouter router={router}>
      <FilterSheet
        filters={filters}
        sort={sort}
        placeIds={PLACE_BOOK.placeIds}
        citySlugs={PLACE_BOOK.slugs}
        regionLabels={REGION_LABELS}
        selectedCities={[]}
        resultCount={12}
        shelterCount={5}
        counts={counts}
      />
    </WithMockRouter>,
  );
  /** Stands in for a navigation the sheet's own form did not cause - the back button, or one of the sheet's instant-apply links having landed. */
  const applyFromElsewhere = (
    nextFilters: FeedFilters,
    nextSort: "freshest" | "longest_waiting" = sort,
  ) =>
    rerender(
      <WithMockRouter router={router}>
        <FilterSheet
          filters={nextFilters}
          sort={nextSort}
          placeIds={PLACE_BOOK.placeIds}
          citySlugs={PLACE_BOOK.slugs}
          regionLabels={REGION_LABELS}
          selectedCities={[]}
          resultCount={3}
          shelterCount={2}
          counts={counts}
        />
      </WithMockRouter>,
    );
  return { router, applyFromElsewhere };
}

describe("FilterSheet", () => {
  it("shows the same result-count sentence the rail's own closing box uses", () => {
    renderSheet();
    const sheet = within(screen.getByTestId("filter-sheet"));
    expect(sheet.getByText(/Знайдено 12 тварин/, { selector: "p" })).toBeTruthy();
  });

  it("checks no box when nothing is filtered - the same bug FilterRail's chips had", () => {
    renderSheet();
    const sheet = within(screen.getByTestId("filter-sheet"));
    for (const label of ["Собаки", "Коти"]) {
      expect((sheet.getByLabelText(label) as HTMLInputElement).checked).toBe(false);
    }
    for (const label of ["Малий", "Середній", "Великий", "Малюк"]) {
      expect((sheet.getByLabelText(facet(label)) as HTMLInputElement).checked).toBe(false);
    }
  });

  it("checks only the explicitly-selected box", () => {
    renderSheet({ ...NO_FILTERS, sizes: { kind: "oneOf", values: ["small"] } });
    const sheet = within(screen.getByTestId("filter-sheet"));
    expect((sheet.getByLabelText(facet("Малий")) as HTMLInputElement).checked).toBe(true);
    expect((sheet.getByLabelText(facet("Середній")) as HTMLInputElement).checked).toBe(false);
    expect((sheet.getByLabelText(facet("Великий")) as HTMLInputElement).checked).toBe(false);
  });

  it("submitting with two boxes checked in one group sends both - not just the first", () => {
    const { router } = renderSheet();
    const sheet = within(screen.getByTestId("filter-sheet"));

    fireEvent.click(sheet.getByLabelText(facet("Малий")));
    fireEvent.click(sheet.getByLabelText(facet("Середній")));
    fireEvent.click(sheet.getByRole("button", { name: /Показати/, hidden: true }));

    expect(router.replace).toHaveBeenCalledTimes(1);
    const [href] = router.replace.mock.calls[0] as [string];
    const params = new URL(href, "http://x").searchParams;
    // One comma-joined param, not two repeated ones: the submit goes back
    // out through `galleryHref`, so the sheet and the rail spell the same
    // state the same way. Both values surviving is what this asserts - the
    // native no-JS submission's repeated-key shape is `filter-url.test.ts`'s
    // and the JS-disabled harness test's job, on the parse side.
    expect(params.get("rozmir")).toBe("medium,small");
  });

  it("submitting with the default (freshest) sort omits the sort param", () => {
    const { router } = renderSheet();
    const sheet = within(screen.getByTestId("filter-sheet"));
    fireEvent.click(sheet.getByRole("button", { name: /Показати/, hidden: true }));

    const [href] = router.replace.mock.calls[0] as [string];
    expect(href).not.toContain("sort=");
  });

  it("'Усі міста' drops the city filter and keeps every other group - it is not a second 'Скинути'", () => {
    const { router } = renderSheet({
      ...NO_FILTERS,
      cities: { kind: "oneOf", values: [BROVARY] },
      species: { kind: "oneOf", values: ["dog"] },
    });
    const allCities = screen.getByRole("link", { name: "Усі міста", hidden: true });

    // The href matters as much as the handler: with no JS this link is the
    // whole behaviour, and nothing intercepts it.
    expect(allCities.getAttribute("href")).toBe("/tvaryny?vyd=dog");

    fireEvent.click(allCities);
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith("/tvaryny?vyd=dog", { scroll: false });
  });

  it("'Скинути' replaces with every filter cleared, sort preserved", () => {
    const { router } = renderSheet(
      { ...NO_FILTERS, species: { kind: "oneOf", values: ["dog"] } },
      "longest_waiting",
    );
    fireEvent.click(screen.getByRole("link", { name: "Скинути", hidden: true }));

    expect(router.replace).toHaveBeenCalledWith("/tvaryny?sort=longest_waiting", {
      scroll: false,
    });
  });
  it("a ticked box does not survive a filter change that came from somewhere else", () => {
    // Uncontrolled inputs keep their dirty checkedness across a re-render:
    // without the form's `key`, ticking "Собаки" and then reaching an
    // unrelated filter state (back button, "Скинути", "Усі міста")
    // leaves the sheet showing a selection the URL does not have - hidden
    // client state outliving the single source of truth.
    const { applyFromElsewhere } = renderSheet();
    const sheet = within(screen.getByTestId("filter-sheet"));

    fireEvent.click(sheet.getByLabelText("Собаки"));
    expect((sheet.getByLabelText("Собаки") as HTMLInputElement).checked).toBe(true);

    applyFromElsewhere({ ...NO_FILTERS, sizes: { kind: "oneOf", values: ["small"] } });

    const after = within(screen.getByTestId("filter-sheet"));
    expect((after.getByLabelText("Собаки") as HTMLInputElement).checked).toBe(false);
    expect((after.getByLabelText(facet("Малий")) as HTMLInputElement).checked).toBe(true);
  });

  it("has a «Вид» group of radios, not checkboxes - exclusive, with an «Усі» option", () => {
    const { router } = renderSheet();
    const sheet = within(screen.getByTestId("filter-sheet"));
    const group = within(sheet.getByRole("group", { name: "Вид", hidden: true }));
    const radios = group.getAllByRole("radio", { hidden: true });
    expect(radios).toHaveLength(3);
    expect((group.getByLabelText("Усі") as HTMLInputElement).checked).toBe(true);

    fireEvent.click(group.getByLabelText("Коти"));
    expect((group.getByLabelText("Усі") as HTMLInputElement).checked).toBe(false);
    fireEvent.click(sheet.getByRole("button", { name: /Показати/, hidden: true }));

    const [href] = router.replace.mock.calls[0] as [string];
    expect(new URL(href, "http://x").searchParams.get("vyd")).toBe("cat");
  });

  it("shows the applied species selection as checked, «Усі» unchecked", () => {
    renderSheet({ ...NO_FILTERS, species: { kind: "oneOf", values: ["dog"] } });
    const sheet = within(screen.getByTestId("filter-sheet"));
    expect((sheet.getByLabelText("Собаки") as HTMLInputElement).checked).toBe(true);
    expect((sheet.getByLabelText("Усі") as HTMLInputElement).checked).toBe(false);
  });

  it("shows «Усі» checked when species is unconstrained", () => {
    renderSheet();
    const sheet = within(screen.getByTestId("filter-sheet"));
    expect((sheet.getByLabelText("Усі") as HTMLInputElement).checked).toBe(true);
  });

  it("has a «Стать» group; ticking «Дівчинка» submits `stat=female`", () => {
    const { router } = renderSheet();
    const sheet = within(screen.getByTestId("filter-sheet"));
    const group = within(sheet.getByRole("group", { name: "Стать", hidden: true }));
    expect(group.getAllByRole("checkbox", { hidden: true })).toHaveLength(3);

    fireEvent.click(group.getByLabelText(facet("Дівчинка")));
    fireEvent.click(sheet.getByRole("button", { name: /Показати/, hidden: true }));

    const [href] = router.replace.mock.calls[0] as [string];
    expect(new URL(href, "http://x").searchParams.get("stat")).toBe("female");
  });

  it("shows the applied sex selection as checked", () => {
    renderSheet({ ...NO_FILTERS, sexes: { kind: "oneOf", values: ["unknown"] } });
    const sheet = within(screen.getByTestId("filter-sheet"));
    expect((sheet.getByLabelText(facet("Не записано")) as HTMLInputElement).checked).toBe(true);
    expect((sheet.getByLabelText(facet("Хлопчик")) as HTMLInputElement).checked).toBe(false);
  });

  it("names each facet pill with its count, pluralised («1 тварина», «3 тварини», «5 тварин»)", () => {
    renderSheet();
    const sheet = within(screen.getByTestId("filter-sheet"));
    expect(sheet.getByLabelText("Малий, 1 тварина")).toBeTruthy();
    expect(sheet.getByLabelText("Середній, 3 тварини")).toBeTruthy();
    expect(sheet.getByLabelText("Великий, 5 тварин")).toBeTruthy();
    // The count is on the pill too, not only in the name.
    expect(sheet.getByLabelText("Великий, 5 тварин").closest("label")?.textContent).toBe(
      "Великий5",
    );
  });

  it("orders cities by count, most first, then alphabetically", () => {
    renderSheet(NO_FILTERS, "freshest", {
      ...COUNTS,
      cities: [facetCity(BROVARY_LABEL, 2), facetCity(KYIV_LABEL, 2)],
    });
    const group = within(screen.getByRole("group", { name: "Місто", hidden: true }));
    const names = group
      .getAllByRole("checkbox", { hidden: true })
      .map((box) => box.getAttribute("aria-label"));
    expect(names).toEqual(["Бровари, 2 тварини", "Київ, 2 тварини"]);
  });

  it("offers only the cities that have an animal, never a zero-count chip from a wider list", () => {
    renderSheet(NO_FILTERS, "freshest", { ...COUNTS, cities: [facetCity(KYIV_LABEL, 1)] });
    const group = within(screen.getByRole("group", { name: "Місто", hidden: true }));
    expect(
      group.getAllByRole("checkbox", { hidden: true }).map((box) => box.getAttribute("aria-label")),
    ).toEqual(["Київ, 1 тварина"]);
  });

  it("disables an option with nothing to find, unless it is ticked and must stay clearable", () => {
    renderSheet({ ...NO_FILTERS, sizes: { kind: "oneOf", values: ["large"] } }, "freshest", {
      ...COUNTS,
      sizes: { small: 0, medium: 2, large: 0 },
    });
    const sheet = within(screen.getByTestId("filter-sheet"));
    expect((sheet.getByLabelText("Малий, 0 тварин") as HTMLInputElement).disabled).toBe(true);
    expect((sheet.getByLabelText("Середній, 2 тварини") as HTMLInputElement).disabled).toBe(false);
    const ticked = sheet.getByLabelText("Великий, 0 тварин") as HTMLInputElement;
    expect(ticked.checked).toBe(true);
    expect(ticked.disabled).toBe(false);
  });

  describe("the oblast group", () => {
    const COUNTS_TWO_REGIONS: GalleryFacetCounts = {
      ...COUNTS,
      cities: [facetCity(BROVARY_LABEL, 4), facetCity(KYIV_LABEL, 9), facetCity(LVIV_LABEL, 3)],
      regions: [
        { regionId: KYIV_OBL, count: 13 },
        { regionId: LVIV_OBL, count: 3 },
      ],
    };
    const cityNames = (): (string | null)[] =>
      within(screen.getByRole("group", { name: "Місто", hidden: true }))
        .getAllByRole("checkbox", { hidden: true })
        .map((box) => box.getAttribute("aria-label"));

    it("lists the oblasts that have animals with their counts, most first", () => {
      renderSheet(NO_FILTERS, "freshest", COUNTS_TWO_REGIONS);
      const group = within(screen.getByRole("group", { name: "Область", hidden: true }));
      expect(
        group
          .getAllByRole("checkbox", { hidden: true })
          .map((box) => box.getAttribute("aria-label")),
      ).toEqual(["Київська, 13 тварин", "Львівська, 3 тварини"]);
    });

    it("submits the oblast's slug as `obl`", () => {
      const { router } = renderSheet(NO_FILTERS, "freshest", COUNTS_TWO_REGIONS);
      const sheet = within(screen.getByTestId("filter-sheet"));
      fireEvent.click(sheet.getByLabelText("Львівська, 3 тварини"));
      fireEvent.click(sheet.getByRole("button", { name: /Показати/, hidden: true }));

      const [href] = router.replace.mock.calls[0] as [string];
      const params = new URL(href, "http://x").searchParams;
      expect(params.get("obl")).toBe("lvivska");
      expect(params.get("misto")).toBeNull();
    });

    it("offers only the chosen oblast's cities once an oblast is chosen", () => {
      renderSheet(
        { ...NO_FILTERS, regions: { kind: "oneOf", values: [LVIV_OBL] } },
        "freshest",
        COUNTS_TWO_REGIONS,
      );
      expect(cityNames()).toEqual(["Львів, 3 тварини"]);
    });

    it("keeps a chosen city of another oblast clearable", () => {
      renderSheet(
        {
          ...NO_FILTERS,
          regions: { kind: "oneOf", values: [LVIV_OBL] },
          cities: { kind: "oneOf", values: [KYIV] },
        },
        "freshest",
        COUNTS_TWO_REGIONS,
      );
      expect(cityNames()).toEqual(["Київ, 9 тварин", "Львів, 3 тварини"]);
    });

    it("'Усі області' drops only the oblast filter", () => {
      const { router } = renderSheet(
        {
          ...NO_FILTERS,
          regions: { kind: "oneOf", values: [LVIV_OBL] },
          species: { kind: "oneOf", values: ["dog"] },
        },
        "freshest",
        COUNTS_TWO_REGIONS,
      );
      const all = screen.getByRole("link", { name: "Усі області", hidden: true });
      expect(all.getAttribute("href")).toBe("/tvaryny?vyd=dog");
      fireEvent.click(all);
      expect(router.replace).toHaveBeenCalledWith("/tvaryny?vyd=dog", { scroll: false });
    });

    it("keeps a chosen oblast with no animal, so it can be cleared, at zero", () => {
      renderSheet({ ...NO_FILTERS, regions: { kind: "oneOf", values: [LVIV_OBL] } });
      const group = within(screen.getByRole("group", { name: "Область", hidden: true }));
      const box = group.getByLabelText("Львівська, 0 тварин") as HTMLInputElement;
      expect(box.checked).toBe(true);
      expect(box.disabled).toBe(false);
    });

    it("tells two same-named settlements apart by their oblast", () => {
      const twin = (id: typeof BROVARY, regionId: typeof KYIV_OBL, slug: string) =>
        facetCity(
          {
            ...BROVARY_LABEL,
            id,
            slug: slug as typeof BROVARY_LABEL.slug,
            name: "Миколаївка",
            kind: "village",
            nameScope: "unique_in_region",
            regionId,
            regionShort: regionId === LVIV_OBL ? "Львівська обл." : "Київська обл.",
          },
          1,
        );
      renderSheet(NO_FILTERS, "freshest", {
        ...COUNTS_TWO_REGIONS,
        cities: [
          twin(BROVARY, KYIV_OBL, "mykolaivka-kyivska"),
          twin(LVIV, LVIV_OBL, "mykolaivka-lvivska"),
        ],
      });
      expect(cityNames()).toEqual([
        "Миколаївка, Київська обл., 1 тварина",
        "Миколаївка, Львівська обл., 1 тварина",
      ]);
    });
  });
});
