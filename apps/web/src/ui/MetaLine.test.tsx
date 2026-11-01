import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MetaLine } from "./MetaLine";

describe("MetaLine", () => {
  it("reads as its parts alone: the separators are drawn, not text", () => {
    render(<MetaLine parts={["Хлопчик", "дорослий", "середній"]} testId="meta" />);
    const meta = screen.getByTestId("meta");
    expect(Array.from(meta.children).map((part) => part.textContent)).toEqual([
      "Хлопчик",
      "дорослий",
      "середній",
    ]);
    expect(meta.textContent).toBe("Хлопчикдорослийсередній");
  });

  it("renders a single part on its own", () => {
    render(<MetaLine parts={["Малий"]} testId="meta" />);
    expect(screen.getByTestId("meta").textContent).toBe("Малий");
  });
});
