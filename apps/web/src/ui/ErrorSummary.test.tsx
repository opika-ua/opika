import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { ErrorSummary } from "./ErrorSummary";

describe("ErrorSummary", () => {
  it("is an alert that can take focus, listing each problem as a button", () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ErrorSummary
        ref={ref}
        items={[
          { key: "a", message: "Вкажіть імʼя", target: "#a" },
          { key: "b", message: "Оберіть вид", target: "#b" },
        ]}
      />,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toBe(ref.current);
    alert.focus();
    expect(document.activeElement).toBe(alert);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Вкажіть імʼя",
      "Оберіть вид",
    ]);
  });

  it("an item takes focus to its field", () => {
    render(
      <>
        <input id="a" aria-label="поле" />
        <ErrorSummary ref={null} items={[{ key: "a", message: "Вкажіть імʼя", target: "#a" }]} />
      </>,
    );
    (HTMLElement.prototype as { scrollIntoView?: () => void }).scrollIntoView = () => {};
    fireEvent.click(screen.getByRole("button", { name: "Вкажіть імʼя" }));
    expect(document.activeElement).toBe(screen.getByLabelText("поле"));
  });
});
