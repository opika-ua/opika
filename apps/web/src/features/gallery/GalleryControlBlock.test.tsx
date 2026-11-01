import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GalleryControlBlock } from "./GalleryControlBlock";

describe("GalleryControlBlock", () => {
  it("renders the title, the phone controls and the desktop row, with no «Фільтр» toggle", () => {
    render(
      <GalleryControlBlock
        title={<h1>Каталог</h1>}
        trailing={<span>trailing</span>}
        mobileSort={<span>mobile sort</span>}
        mobileChips={<span>chips</span>}
        mobileCount={<span>count</span>}
      >
        <span>row content</span>
      </GalleryControlBlock>,
    );
    for (const text of ["Каталог", "trailing", "mobile sort", "chips", "count", "row content"]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByTestId("gallery-filter-row").textContent).toBe("row content");
  });
});
