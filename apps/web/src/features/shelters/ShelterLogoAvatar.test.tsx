import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ShelterLogoAvatar } from "./ShelterLogoAvatar";

describe("ShelterLogoAvatar", () => {
  it("shows the shelter's own initials when there is no logo", () => {
    render(<ShelterLogoAvatar logo={null} displayName="Притулок «Домівка»" />);
    // getByText throws if nothing matches - presence is the assertion.
    screen.getByText("ПД");
  });

  it("the initials fallback is decorative - the shelter's name carries the information elsewhere", () => {
    const { container } = render(<ShelterLogoAvatar logo={null} displayName="Лапа допомоги" />);
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});
