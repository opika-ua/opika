import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ShelterLogoAvatar } from "./ShelterLogoAvatar";

describe("ShelterLogoAvatar", () => {
  it("shows the shelter's own initials when there is no logo", () => {
    const { container } = render(
      <ShelterLogoAvatar logo={null} displayName="Притулок «Домівка»" />,
    );
    // The initials are CSS content from `data-initials`, not DOM text (see `Avatar`).
    expect(container.querySelector("[data-initials]")?.getAttribute("data-initials")).toBe("ПД");
  });

  it("the initials fallback is decorative - the shelter's name carries the information elsewhere", () => {
    const { container } = render(<ShelterLogoAvatar logo={null} displayName="Лапа допомоги" />);
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});
