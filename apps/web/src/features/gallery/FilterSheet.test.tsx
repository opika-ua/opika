import { type CityId, CityIdSchema, type FeedFilters, NO_FILTERS } from "@opika/domain";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FilterSheet } from "./FilterSheet";
import { mockAppRouter, WithMockRouter } from "./test-router";

/**
 * `getByRole` for the submit button and the footer/Уся-Київщина links needs
 * `{ hidden: true }`: this component's `<dialog>` never has `showModal()`
 * called on it in these tests (they're exercising form-submission logic,
 * not the open/close interaction), and content inside a closed `<dialog>`
 * is correctly excluded from the accessibility tree — real accessibility
 * behaviour that `getByRole` respects by default, confirmed by dumping the
 * DOM and finding the elements present but unqueryable without the flag.
 * `getByLabelText` for the checkboxes doesn't perform the same hidden-state
 * computation, which is why those queries below don't need it.
 */

const BROVARY = CityIdSchema.parse("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
const KYIV = CityIdSchema.parse("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
const CITIES: ReadonlyArray<{ id: CityId; name: string }> = [
  { id: BROVARY, name: "Бровари" },
  { id: KYIV, name: "Київ" },
];

function renderSheet(filters = NO_FILTERS, sort: "freshest" | "longest_waiting" = "freshest") {
  const router = mockAppRouter();
  const { rerender } = render(
    <WithMockRouter router={router}>
      <FilterSheet
        filters={filters}
        sort={sort}
        cities={CITIES}
        resultCount={12}
        shelterCount={5}
      />
    </WithMockRouter>,
  );
  /** Stands in for a navigation the sheet's own form did not cause — the back button, or one of the sheet's instant-apply links having landed. */
  const applyFromElsewhere = (
    nextFilters: FeedFilters,
    nextSort: "freshest" | "longest_waiting" = sort,
  ) =>
    rerender(
      <WithMockRouter router={router}>
        <FilterSheet
          filters={nextFilters}
          sort={nextSort}
          cities={CITIES}
          resultCount={3}
          shelterCount={2}
        />
      </WithMockRouter>,
    );
  return { router, applyFromElsewhere };
}

describe("FilterSheet", () => {
  it("shows the same result-count sentence the rail's own closing box uses", () => {
    renderSheet();
    const sheet = within(screen.getByTestId("filter-sheet"));
    expect(sheet.getByText(/Підходить 12 тварин/, { selector: "p" })).toBeTruthy();
  });

  it("checks no box when nothing is filtered — the same bug FilterRail's chips had", () => {
    renderSheet();
    const sheet = within(screen.getByTestId("filter-sheet"));
    for (const label of ["Собаки", "Коти", "Малий", "Середній", "Великий", "Малюк"]) {
      expect((sheet.getByLabelText(label) as HTMLInputElement).checked).toBe(false);
    }
  });

  it("checks only the explicitly-selected box", () => {
    renderSheet({ ...NO_FILTERS, sizes: { kind: "oneOf", values: ["small"] } });
    const sheet = within(screen.getByTestId("filter-sheet"));
    expect((sheet.getByLabelText("Малий") as HTMLInputElement).checked).toBe(true);
    expect((sheet.getByLabelText("Середній") as HTMLInputElement).checked).toBe(false);
    expect((sheet.getByLabelText("Великий") as HTMLInputElement).checked).toBe(false);
  });

  it("submitting with two boxes checked in one group sends both — not just the first", () => {
    const { router } = renderSheet();
    const sheet = within(screen.getByTestId("filter-sheet"));

    fireEvent.click(sheet.getByLabelText("Малий"));
    fireEvent.click(sheet.getByLabelText("Середній"));
    fireEvent.click(sheet.getByRole("button", { name: /Показати/, hidden: true }));

    expect(router.replace).toHaveBeenCalledTimes(1);
    const [href] = router.replace.mock.calls[0] as [string];
    const params = new URL(href, "http://x").searchParams;
    // One comma-joined param, not two repeated ones: the submit goes back
    // out through `galleryHref`, so the sheet and the rail spell the same
    // state the same way. Both values surviving is what this asserts — the
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

  it("'Уся Київщина' drops the city filter and keeps every other group — it is not a second 'Скинути'", () => {
    const { router } = renderSheet({
      ...NO_FILTERS,
      cities: { kind: "oneOf", values: [BROVARY] },
      species: { kind: "oneOf", values: ["dog"] },
    });
    const allCities = screen.getByRole("link", { name: "Уся Київщина", hidden: true });

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
    // unrelated filter state (back button, "Скинути", "Уся Київщина")
    // leaves the sheet showing a selection the URL does not have — hidden
    // client state outliving the single source of truth.
    const { applyFromElsewhere } = renderSheet();
    const sheet = within(screen.getByTestId("filter-sheet"));

    fireEvent.click(sheet.getByLabelText("Собаки"));
    expect((sheet.getByLabelText("Собаки") as HTMLInputElement).checked).toBe(true);

    applyFromElsewhere({ ...NO_FILTERS, sizes: { kind: "oneOf", values: ["small"] } });

    const after = within(screen.getByTestId("filter-sheet"));
    expect((after.getByLabelText("Собаки") as HTMLInputElement).checked).toBe(false);
    expect((after.getByLabelText("Малий") as HTMLInputElement).checked).toBe(true);
  });

  it("the ✕ falls through to its own href when the dialog was revealed by :target, not showModal()", () => {
    // `dialog.close()` is a no-op on a dialog with no `open` attribute — the
    // state a pre-hydration click on the trigger, or a shared URL already
    // carrying #tvaryny-filters, leaves the sheet in. Swallowing the click
    // there would leave the sheet with no way to close at all.
    renderSheet();
    const dialog = screen.getByTestId("filter-sheet") as HTMLDialogElement;
    expect(dialog.open).toBe(false);

    const notPrevented = fireEvent.click(
      screen.getByRole("link", { name: "Закрити", hidden: true }),
    );
    expect(notPrevented, "the anchor's own href='#' must still run").toBe(true);
  });

  it("the ✕ closes the dialog itself once it really is open", () => {
    renderSheet();
    const dialog = screen.getByTestId("filter-sheet") as HTMLDialogElement;
    dialog.showModal();

    const prevented = fireEvent.click(screen.getByRole("link", { name: "Закрити" }));
    expect(dialog.open).toBe(false);
    expect(prevented, "an open dialog closes in place, without navigating the fragment").toBe(
      false,
    );
  });
});
