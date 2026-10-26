import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GalleryControlBlock } from "./GalleryControlBlock";

describe("GalleryControlBlock", () => {
  it("renders the title and trailing content, and the dropdown row, by default open", () => {
    render(
      <GalleryControlBlock title={<h1>Каталог</h1>} trailing={<span>trailing</span>}>
        <span>row content</span>
      </GalleryControlBlock>,
    );

    expect(screen.getByText("Каталог")).toBeTruthy();
    expect(screen.getByText("trailing")).toBeTruthy();
    expect(screen.getByText("row content")).toBeTruthy();
    expect(screen.getByTestId("gallery-filter-toggle").getAttribute("aria-expanded")).toBe("true");
  });

  /**
   * The row stays mounted at all times now (it used to unmount on close) -
   * Oleksii asked for an animated height change, and an unmounted element
   * has no height to animate from. `aria-hidden`/`inert` are what verify
   * "closed" instead of DOM absence: `queryByText` doesn't look at either
   * one, so it would still find "row content" with the row merely collapsed
   * to zero height, which is why this isn't `toBeNull()` anymore.
   */
  it("clicking «Фільтр» marks the row aria-hidden and inert; clicking again clears both", () => {
    render(
      <GalleryControlBlock title={<h1>Каталог</h1>} trailing={null}>
        <span>row content</span>
      </GalleryControlBlock>,
    );

    const toggle = screen.getByTestId("gallery-filter-toggle");
    const row = screen.getByTestId("gallery-filter-row");
    expect(row.getAttribute("aria-hidden")).toBeNull();
    expect(row.inert).toBe(false);

    fireEvent.click(toggle);
    expect(row.getAttribute("aria-hidden")).toBe("true");
    expect(row.inert).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(toggle);
    expect(row.getAttribute("aria-hidden")).toBeNull();
    expect(row.inert).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("the toggle names what it controls, for assistive tech", () => {
    render(
      <GalleryControlBlock title={<h1>Каталог</h1>} trailing={null}>
        <span>row content</span>
      </GalleryControlBlock>,
    );

    const toggle = screen.getByTestId("gallery-filter-toggle");
    const controlledId = toggle.getAttribute("aria-controls");
    expect(controlledId).toBeTruthy();
    expect(document.getElementById(controlledId as string)).toBe(
      screen.getByTestId("gallery-filter-row"),
    );
  });
});
