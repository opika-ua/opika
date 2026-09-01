import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import GalleryError from "./error";

/**
 * `docs/design/README.md`'s note on this component: `reset()`, not a
 * navigation, is what "Спробувати ще раз" must call — the URL is the
 * state, so re-rendering the current route (Next's own contract for what
 * `reset()` does) is what restores whatever filters were already there.
 * This is the direct, reliable half of that guarantee; the harness's
 * `gallery-error.harness.ts` covers the other half (the URL itself
 * surviving the click) against a real browser and a real route.
 */
describe("GalleryError", () => {
  it("calls reset(), not anything that would navigate away", () => {
    const reset = vi.fn();
    render(<GalleryError error={new Error("boom")} reset={reset} />);

    fireEvent.click(screen.getByTestId("gallery-error-retry"));

    expect(reset).toHaveBeenCalledTimes(1);
  });
});
