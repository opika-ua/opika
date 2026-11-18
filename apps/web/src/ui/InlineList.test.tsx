import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./Button";
import { InlineList } from "./InlineList";

describe("InlineList", () => {
  it("reads as its items alone, in order: the separators are drawn, not text", () => {
    const { container } = render(
      <InlineList
        items={[
          "Притулок «Домівка»",
          "6 карток",
          <Button key="show" variant="link">
            Показати
          </Button>,
        ]}
      />,
    );
    const row = container.firstElementChild as HTMLElement;
    expect(row.textContent).toBe("Притулок «Домівка»6 картокПоказати");
    expect(row.textContent).not.toMatch(/[·•|]/u);
    const items = row.querySelectorAll(".inline-list-row > *");
    expect(Array.from(items).map((item) => item.textContent)).toEqual([
      "Притулок «Домівка»",
      "6 карток",
      "Показати",
    ]);
  });

  it("keeps a control a control: reachable by role, focusable", () => {
    render(
      <InlineList
        items={[
          "2 картки давно не оновлювались",
          <Button key="show" variant="link">
            Показати
          </Button>,
        ]}
      />,
    );
    const button = screen.getByRole("button", { name: "Показати" });
    button.focus();
    expect(document.activeElement).toBe(button);
  });
});
