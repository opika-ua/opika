import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MetaLine } from "./MetaLine";

describe("MetaLine", () => {
  it("attaches each separator to the part before it, so a wrapped line never starts with one", () => {
    const { container } = render(<MetaLine parts={["Хлопчик", "дорослий", "середній"]} />);
    const items = Array.from(container.querySelectorAll(":scope > span > span"));
    expect(items.map((item) => item.textContent)).toEqual(["Хлопчик", "дорослий", "середній"]);
    const separatorsAfterText = items.map((item) =>
      item.lastElementChild?.getAttribute("aria-hidden"),
    );
    expect(separatorsAfterText).toEqual(["true", "true", undefined]);
    for (const item of items) expect(item.firstChild?.nodeType).toBe(Node.TEXT_NODE);
  });

  it("draws no separator for a single part", () => {
    const { container } = render(<MetaLine parts={["Малий"]} />);
    expect(container.querySelector("[aria-hidden]")).toBeNull();
  });
});
