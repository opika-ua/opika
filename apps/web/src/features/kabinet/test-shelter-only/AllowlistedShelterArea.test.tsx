import { COPY_PENDING } from "@opika/i18n";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AllowlistedShelterArea } from "./AllowlistedShelterArea";

/** The CG-Q1 area itself: nothing with an empty namespace, its strings otherwise. */
describe("AllowlistedShelterArea", () => {
  it("renders nothing while the namespace is empty (PR 2)", () => {
    const { container } = render(<AllowlistedShelterArea />);
    expect(container.innerHTML).toBe("");
  });

  it("renders a pending fixture string when given one", () => {
    render(<AllowlistedShelterArea copy={{ photoHint: `${COPY_PENDING} photo hint` }} />);
    expect(screen.getByTestId("allowlisted-shelter-area").textContent).toBe(
      `${COPY_PENDING} photo hint`,
    );
  });
});
