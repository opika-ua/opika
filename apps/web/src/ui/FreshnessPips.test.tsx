import { freshnessPips } from "@opika/ui";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FreshnessPips } from "./FreshnessPips";

const KINDS = ["fresh", "aging", "stale"] as const;

/** The pips as drawn: one entry per pip, in order, "empty" for an outlined one. */
const drawn = (container: HTMLElement): string[] =>
  (container.querySelector("[data-fill]")?.getAttribute("data-fill") ?? "").split(" ");

describe("FreshnessPips", () => {
  it.each(KINDS)("%s fills the same pips, in the same places, as the deck's marker", (kind) => {
    const { container } = render(<FreshnessPips kind={kind} label="Оновлено 3 дні тому" />);
    const truth = freshnessPips(kind).map((fill) => fill === "empty");
    expect(drawn(container).map((fill) => fill === "empty")).toEqual(truth);
  });

  it("always says the day count in words next to the pips, and hides the pips from assistive tech", () => {
    const { container } = render(<FreshnessPips kind="aging" label="Оновлено 12 днів тому" />);
    expect(screen.getByText("Оновлено 12 днів тому")).toBeTruthy();
    expect(container.querySelector("[data-fill]")?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelectorAll("[data-fill] > span")).toHaveLength(3);
  });

  it("never draws an alarm tone, whatever the age", () => {
    for (const kind of KINDS) {
      const { container, unmount } = render(<FreshnessPips kind={kind} label="x" />);
      expect(container.innerHTML).not.toMatch(/danger|warning|opacity/);
      unmount();
    }
  });
});
