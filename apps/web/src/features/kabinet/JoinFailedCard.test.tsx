import { uk } from "@opika/i18n";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { JoinFailedCard } from "./JoinFailedCard";

/**
 * `/kabinet` when the automatic invitation accept failed (IN-Q12): a clear
 * message, announced, and a retry. The strings are `[COPY PENDING]`, so
 * elements are found by their catalogue keys and the test asserts structure
 * and behaviour, not wording.
 */
describe("JoinFailedCard", () => {
  it("announces the failure and offers a retry that reloads /kabinet", () => {
    render(<JoinFailedCard />);
    expect(screen.getByRole("alert").textContent).toBe(uk.kabinet.confirm.joinFailed);
    const retry = screen.getByRole("link", { name: uk.kabinet.confirm.joinRetry });
    expect(retry.getAttribute("href")).toBe("/kabinet");
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
  });

  it("the retry carries focus-visible styling and a 56px target", () => {
    render(<JoinFailedCard />);
    const retry = screen.getByRole("link", { name: uk.kabinet.confirm.joinRetry });
    expect(retry.className).toContain("focus-visible:outline");
    expect(retry.className).toContain("min-h-14");
  });
});
