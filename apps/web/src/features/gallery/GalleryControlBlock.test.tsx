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

  it("clicking «Фільтр» hides the row; clicking again shows it", () => {
    render(
      <GalleryControlBlock title={<h1>Каталог</h1>} trailing={null}>
        <span>row content</span>
      </GalleryControlBlock>,
    );

    const toggle = screen.getByTestId("gallery-filter-toggle");
    fireEvent.click(toggle);
    expect(screen.queryByText("row content")).toBeNull();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(toggle);
    expect(screen.getByText("row content")).toBeTruthy();
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
