import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import GortatyError from "./error";

/**
 * This file exists at all because of a real bug this branch found and
 * fixed: without a dedicated `error.tsx` here, Next's error-boundary
 * nesting means `/tvaryny`'s own `error.tsx` would catch a failure in
 * this route too, rendering gallery-specific copy («Ваші фільтри
 * збережені») for a deck failure. This component test covers what a
 * component test can — that retry calls `retry()`, not `reset()` (round
 * 2 found `reset()` alone doesn't re-run the Server Component that can
 * fail — see this file's own top comment), and the escape link points at
 * the gallery; the boundary-isolation claim itself is a property of
 * Next's own routing, not something a render test exercises.
 */
describe("GortatyError", () => {
  it("calls retry(), not reset() — reset() alone cannot recover from a server-side failure", () => {
    const retry = vi.fn();
    render(<GortatyError error={new Error("boom")} reset={vi.fn()} retry={retry} />);

    fireEvent.click(screen.getByTestId("gortaty-error-retry"));

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("offers a link back to the gallery", () => {
    render(<GortatyError error={new Error("boom")} reset={vi.fn()} retry={vi.fn()} />);

    const link = screen.getByTestId("gortaty-error-back-to-list");
    expect(link.getAttribute("href")).toBe("/tvaryny");
  });
});
