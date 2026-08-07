import { type CityId, CityIdSchema, NO_FILTERS } from "@opika/domain";
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
  render(
    <WithMockRouter router={router}>
      <FilterSheet filters={filters} sort={sort} cities={CITIES} resultCount={12} />
    </WithMockRouter>,
  );
  return router;
}

describe("FilterSheet", () => {
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
    const router = renderSheet();
    const sheet = within(screen.getByTestId("filter-sheet"));

    fireEvent.click(sheet.getByLabelText("Малий"));
    fireEvent.click(sheet.getByLabelText("Середній"));
    fireEvent.click(sheet.getByRole("button", { name: /Показати/, hidden: true }));

    expect(router.replace).toHaveBeenCalledTimes(1);
    const [href] = router.replace.mock.calls[0] as [string];
    const params = new URL(href, "http://x").searchParams;
    expect(params.getAll("rozmir").sort()).toEqual(["medium", "small"]);
  });

  it("submitting with the default (freshest) sort omits the sort param", () => {
    const router = renderSheet();
    const sheet = within(screen.getByTestId("filter-sheet"));
    fireEvent.click(sheet.getByRole("button", { name: /Показати/, hidden: true }));

    const [href] = router.replace.mock.calls[0] as [string];
    expect(href).not.toContain("sort=");
  });

  it("'Уся Київщина' replaces immediately, without needing a submit", () => {
    const router = renderSheet({ ...NO_FILTERS, cities: { kind: "oneOf", values: [BROVARY] } });
    fireEvent.click(screen.getByRole("link", { name: "Уся Київщина", hidden: true }));

    expect(router.replace).toHaveBeenCalledTimes(1);
    const [href] = router.replace.mock.calls[0] as [string];
    expect(href).not.toContain("misto=");
  });

  it("'Скинути' replaces with every filter cleared, sort preserved", () => {
    const router = renderSheet(
      { ...NO_FILTERS, species: { kind: "oneOf", values: ["dog"] } },
      "longest_waiting",
    );
    fireEvent.click(screen.getByRole("link", { name: "Скинути", hidden: true }));

    expect(router.replace).toHaveBeenCalledWith("/tvaryny?sort=longest_waiting", {
      scroll: false,
    });
  });
});
