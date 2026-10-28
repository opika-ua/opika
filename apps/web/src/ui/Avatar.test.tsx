import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar, initialsOf } from "./Avatar";
import { Icon } from "./Icon";

describe("initialsOf", () => {
  it("takes the first letter of the first two words, skipping quotes", () => {
    expect(initialsOf("Домівка друзів")).toBe("ДД");
    expect(initialsOf("«Лапки» і хвости")).toBe("ЛІ");
    expect(initialsOf("")).toBe("");
  });
});

describe("Avatar", () => {
  it("is decorative: hidden from assistive tech", () => {
    const { container } = render(<Avatar kind="initials" name="Домівка друзів" />);
    const node = container.firstElementChild;
    expect(node?.getAttribute("aria-hidden")).toBe("true");
    expect(node?.textContent).toBe("ДД");
  });
});

describe("Icon", () => {
  it("is hidden unless it has a label, then it is an image with that name", () => {
    const { container, rerender } = render(<Icon name="close" />);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    rerender(<Icon name="close" label="Закрити" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("role")).toBe("img");
    expect(svg?.querySelector("title")?.textContent).toBe("Закрити");
  });
});
