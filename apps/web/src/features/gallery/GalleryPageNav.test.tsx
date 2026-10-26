import { NO_FILTERS } from "@opika/domain";
import { uk } from "@opika/i18n";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GalleryPageNav } from "./GalleryPageNav";

describe("GalleryPageNav", () => {
  it("renders nothing for a single-page result set", () => {
    const { container } = render(
      <GalleryPageNav
        filters={NO_FILTERS}
        sort="freshest"
        citySlugs={new Map()}
        page={1}
        totalPages={1}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("prev is absent (not merely disabled) on page 1; next is a real link", () => {
    render(
      <GalleryPageNav
        filters={NO_FILTERS}
        sort="freshest"
        citySlugs={new Map()}
        page={1}
        totalPages={3}
      />,
    );
    expect(screen.queryByTestId("pagination-prev")).toBeNull();
    expect(screen.getByTestId("pagination-next").getAttribute("href")).toBe("/tvaryny?stor=2");
  });

  it("next is absent on the last page; prev is a real link", () => {
    render(
      <GalleryPageNav
        filters={NO_FILTERS}
        sort="freshest"
        citySlugs={new Map()}
        page={3}
        totalPages={3}
      />,
    );
    expect(screen.queryByTestId("pagination-next")).toBeNull();
    expect(screen.getByTestId("pagination-prev").getAttribute("href")).toBe("/tvaryny?stor=2");
  });

  /**
   * Icon-only, unlike the existing `GalleryPagination`'s prev/next — no
   * visible text means no WCAG 2.5.3 mismatch is even possible, which is
   * exactly why icon-only is safe here where it previously was not
   * (`GalleryPageNav.tsx`'s own top comment).
   */
  it("prev/next carry no visible text — the aria-label names what they do", () => {
    render(
      <GalleryPageNav
        filters={NO_FILTERS}
        sort="freshest"
        citySlugs={new Map()}
        page={2}
        totalPages={3}
      />,
    );
    const prev = screen.getByTestId("pagination-prev");
    const next = screen.getByTestId("pagination-next");
    expect(prev.textContent).toBe("");
    expect(next.textContent).toBe("");
    expect(prev.getAttribute("aria-label")).toBe(uk.pagination.prev);
    expect(next.getAttribute("aria-label")).toBe(uk.pagination.next);
  });

  it("the current page is a non-interactive span with aria-current", () => {
    render(
      <GalleryPageNav
        filters={NO_FILTERS}
        sort="freshest"
        citySlugs={new Map()}
        page={2}
        totalPages={3}
      />,
    );
    const pages = screen.getAllByTestId("pagination-page");
    const current = pages.find((p) => p.getAttribute("data-active") === "true");
    expect(current?.tagName).toBe("SPAN");
    expect(current?.getAttribute("aria-current")).toBe("page");
    expect(current?.textContent).toContain("2");
  });

  it("shows «з N» only once the window is truncated with an ellipsis", () => {
    render(
      <GalleryPageNav
        filters={NO_FILTERS}
        sort="freshest"
        citySlugs={new Map()}
        page={1}
        totalPages={3}
      />,
    );
    expect(screen.queryByText(/^з /)).toBeNull();

    render(
      <GalleryPageNav
        filters={NO_FILTERS}
        sort="freshest"
        citySlugs={new Map()}
        page={1}
        totalPages={20}
      />,
    );
    expect(screen.getByText("з 20")).toBeTruthy();
  });
});
