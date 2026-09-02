import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import GalleryError from "./error";

/**
 * `docs/design/README.md`'s note on this component: "Спробувати ще раз"
 * must actually re-fetch, not just clear the error card. Round 2 found
 * this component originally called the WRONG one of Next's two props —
 * `reset()` clears the boundary without re-running the Server Component,
 * `retry()` calls `router.refresh()` first — see this file's own top
 * comment for the full account, verified against a real production build
 * with the database stopped and restarted. This is the direct, reliable
 * half of that guarantee; the harness's `gallery-error.harness.ts` covers
 * the other half (the URL itself surviving the click) against a real
 * browser and a real route.
 */
describe("GalleryError", () => {
  it("calls retry(), not reset() — reset() alone cannot recover from a server-side failure", () => {
    const retry = vi.fn();
    render(<GalleryError error={new Error("boom")} reset={vi.fn()} retry={retry} />);

    fireEvent.click(screen.getByTestId("gallery-error-retry"));

    expect(retry).toHaveBeenCalledTimes(1);
  });

  /**
   * E5: the real escape hatch, added after finding that a filter rail here
   * would not be one (see this file's own top comment). A bare `/tvaryny`
   * link, no query string — never the current, already-failing one.
   */
  it("offers a link to the bare, unfiltered gallery — not a re-run of the same query", () => {
    render(<GalleryError error={new Error("boom")} reset={vi.fn()} retry={vi.fn()} />);

    const link = screen.getByTestId("gallery-error-show-all");
    expect(link.getAttribute("href")).toBe("/tvaryny");
  });
});
