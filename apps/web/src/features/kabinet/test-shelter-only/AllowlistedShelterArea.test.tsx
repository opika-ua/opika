import { COPY_PENDING } from "@opika/i18n";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AllowlistedShelterArea } from "./AllowlistedShelterArea";

/** The CG-Q1 area itself: nothing with an empty namespace, its strings otherwise. */
describe("AllowlistedShelterArea", () => {
  /** Since K3 the namespace holds only the animal form's group, which is that screen's to show. */
  it("renders nothing from the live namespace: its only lines are the animal form's group", () => {
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
