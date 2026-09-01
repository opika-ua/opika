import { NO_FILTERS } from "@opika/domain";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GalleryPagination } from "./GalleryPagination";

/**
 * The harness (`test/harness/gallery-pagination.harness.ts`) drives the real
 * corpus, which means it only ever sees the pages that corpus happens to
 * have: page 1 and page 2 of many. Everything that depends on *which* page
 * is being shown — the last page, a single-page result, a window wide
 * enough to need an ellipsis — has no seed data that reaches it, so it is
 * asserted here against props instead. Without this file, inverting
 * `page < totalPages` (next stays a live link on the last page, sending
 * every reader to a `?stor=` the server then silently clamps back) or
 * `totalPages <= 1` (a one-page result grows a pager that can only ever
 * point at itself) breaks nothing that runs.
 */

const pageOf = (href: string): number => {
  const stor = new URL(href, "http://x").searchParams.get("stor");
  return stor === null ? 1 : Number(stor);
};

const pageLinks = () =>
  screen
    .getAllByTestId("pagination-page")
    .filter((el): el is HTMLAnchorElement => el.tagName === "A");

describe("GalleryPagination", () => {
  it("renders nothing at all when there is only one page — or none", () => {
    // `hasPagination`, the same predicate `app/tvaryny/page.tsx` gates the
    // skip link on: if this ever renders when that returns false, the skip
    // link stops being the thing that is missing and starts being a link
    // to an anchor that is there but unreachable.
    const { container: single } = render(
      <GalleryPagination filters={NO_FILTERS} sort="freshest" page={1} totalPages={1} />,
    );
    expect(single.innerHTML).toBe("");

    const { container: none } = render(
      <GalleryPagination filters={NO_FILTERS} sort="freshest" page={1} totalPages={0} />,
    );
    expect(none.innerHTML).toBe("");
  });

  it("on the last page, next is inert and prev is a real link — the mirror of page 1", () => {
    render(<GalleryPagination filters={NO_FILTERS} sort="freshest" page={4} totalPages={4} />);

    expect(screen.queryByTestId("pagination-next")).toBeNull();
    expect(screen.getByTestId("pagination-next-disabled").tagName).toBe("SPAN");
    expect(screen.queryByTestId("pagination-prev-disabled")).toBeNull();
    expect(pageOf(screen.getByTestId("pagination-prev").getAttribute("href") ?? "")).toBe(3);
  });

  it("on page 1, prev is inert and next points at page 2", () => {
    render(<GalleryPagination filters={NO_FILTERS} sort="freshest" page={1} totalPages={4} />);

    expect(screen.queryByTestId("pagination-prev")).toBeNull();
    expect(screen.getByTestId("pagination-prev-disabled").tagName).toBe("SPAN");
    expect(pageOf(screen.getByTestId("pagination-next").getAttribute("href") ?? "")).toBe(2);
  });

  it("the current page is marked, inert, and drawn exactly once", () => {
    render(<GalleryPagination filters={NO_FILTERS} sort="freshest" page={3} totalPages={9} />);

    const marked = screen
      .getAllByTestId("pagination-page")
      .filter((el) => el.getAttribute("aria-current") === "page");
    expect(marked).toHaveLength(1);
    const [active] = marked;
    expect(active?.tagName, "the page you are on is not a link to itself").toBe("SPAN");
    expect(active?.textContent).toMatch(/^3/);
  });

  it("every page link stays inside 1..totalPages, ellipsis or not", () => {
    // The windowing invariant that matters at the boundaries: a band drawn
    // around `current` must never spill past either end, or a link on the
    // last page would point one page past the end and the server would clamp
    // it back to the page the reader was already on.
    for (const [page, totalPages] of [
      [1, 9],
      [2, 9],
      [5, 9],
      [8, 9],
      [9, 9],
    ] as const) {
      const { unmount } = render(
        <GalleryPagination
          filters={NO_FILTERS}
          sort="freshest"
          page={page}
          totalPages={totalPages}
        />,
      );
      const numbers = pageLinks().map((el) => pageOf(el.getAttribute("href") ?? ""));
      expect(numbers.length, `page ${page}/${totalPages} drew no links`).toBeGreaterThan(0);
      for (const drawn of numbers) {
        expect(drawn, `page ${page}/${totalPages} drew a link to ${drawn}`).toBeGreaterThanOrEqual(
          1,
        );
        expect(drawn).toBeLessThanOrEqual(totalPages);
      }
      expect(numbers, "the current page is never a link to itself").not.toContain(page);
      unmount();
    }
  });

  /**
   * V2 repoint (docs/design/README.md, "Pagination — not infinite scroll"):
   * "«з N» renders only when the number list is truncated with an
   * ellipsis... while every number is on screen the counter just restates
   * what you can count." Previously rendered unconditionally whenever
   * pagination existed at all (>1 page) — this is the untruncated case the
   * old behaviour got wrong and the harness's real corpus (always past the
   * truncation threshold) can't reach.
   */
  it("omits 'з N' when every page number is already on screen", () => {
    render(<GalleryPagination filters={NO_FILTERS} sort="freshest" page={1} totalPages={4} />);
    expect(screen.queryByText(/з \d+/)).toBeNull();
  });

  it("shows 'з N' once the number list is truncated with an ellipsis", () => {
    render(<GalleryPagination filters={NO_FILTERS} sort="freshest" page={5} totalPages={9} />);
    expect(screen.getByText("з 9")).toBeTruthy();
  });

  it("page links carry the active filters and sort forward unchanged", () => {
    const filters = {
      ...NO_FILTERS,
      species: { kind: "oneOf" as const, values: ["dog"] as const },
    };
    render(<GalleryPagination filters={filters} sort="longest_waiting" page={2} totalPages={4} />);

    expect(screen.getByTestId("pagination-next").getAttribute("href")).toBe(
      "/tvaryny?vyd=dog&sort=longest_waiting&stor=3",
    );
    // Back to page 1 drops `stor` entirely rather than writing `stor=1` —
    // one URL per result-set position, not two spellings of the first.
    expect(screen.getByTestId("pagination-prev").getAttribute("href")).toBe(
      "/tvaryny?vyd=dog&sort=longest_waiting",
    );
  });
});
