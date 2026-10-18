import { COPY_PENDING } from "@opika/i18n";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AllowlistedShelterArea } from "./AllowlistedShelterArea";

/** The CG-Q1 area itself: nothing with an empty namespace, its strings otherwise. */
describe("AllowlistedShelterArea", () => {
  /** Empty since K2 (PR 5): its one line, K3's, moved to `animalForm.listed` (P10). */
  it("renders nothing from the live namespace, which is empty", () => {
    const { container } = render(<AllowlistedShelterArea />);
    expect(container.innerHTML).toBe("");
  });

  it("shows a top-level string and never a screen's group", () => {
    render(
      <AllowlistedShelterArea
        copy={{ hint: `${COPY_PENDING} hint`, animalForm: { line: `${COPY_PENDING} form line` } }}
      />,
    );
    expect(screen.getByTestId("allowlisted-shelter-area").textContent).toBe(`${COPY_PENDING} hint`);
  });

  it("renders a pending fixture string when given one", () => {
    render(<AllowlistedShelterArea copy={{ photoHint: `${COPY_PENDING} photo hint` }} />);
    expect(screen.getByTestId("allowlisted-shelter-area").textContent).toBe(
      `${COPY_PENDING} photo hint`,
    );
  });
});
