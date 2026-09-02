import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import GortatyError from "./error";

/**
 * This file exists at all because of a real bug this branch found and
 * fixed: without a dedicated `error.tsx` here, Next's error-boundary
 * nesting means `/tvaryny`'s own `error.tsx` would catch a failure in
 * this route too, rendering gallery-specific copy («Ваші фільтри
 * збережені») for a deck failure. This component test covers what a
 * component test can — that retry calls `reset()` and the escape link
 * points at the gallery; the boundary-isolation claim itself is a
 * property of Next's own routing, not something a render test exercises.
 */
describe("GortatyError", () => {
  it("calls reset(), not anything that would navigate away", () => {
    const reset = vi.fn();
    render(<GortatyError error={new Error("boom")} reset={reset} />);

    fireEvent.click(screen.getByTestId("gortaty-error-retry"));

    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("offers a link back to the gallery", () => {
    render(<GortatyError error={new Error("boom")} reset={vi.fn()} />);

    const link = screen.getByTestId("gortaty-error-back-to-list");
    expect(link.getAttribute("href")).toBe("/tvaryny");
  });
});
