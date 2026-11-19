import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { ErrorSummary, type ErrorSummaryItem, errorFocusOf } from "./ErrorSummary";

const name: ErrorSummaryItem = { key: "a", label: "Назва притулку", target: "#a" };
const city: ErrorSummaryItem = { key: "b", label: "Місто", target: "#b" };
const items = [name, city];

describe("ErrorSummary", () => {
  it("is an alert that can take focus, with its heading and each field as a link", () => {
    const ref = createRef<HTMLDivElement>();
    render(<ErrorSummary ref={ref} heading="Заповніть 2 поля:" items={items} />);
    const alert = screen.getByRole("alert");
    expect(alert).toBe(ref.current);
    alert.focus();
    expect(document.activeElement).toBe(alert);
    expect(alert.textContent).toContain("Заповніть 2 поля:");
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Назва притулку",
      "Місто",
    ]);
  });

  it("a link takes focus to its field", () => {
    render(
      <>
        <input id="a" aria-label="поле" />
        <ErrorSummary ref={null} items={items} />
      </>,
    );
    (HTMLElement.prototype as { scrollIntoView?: () => void }).scrollIntoView = () => {};
    fireEvent.click(screen.getByRole("link", { name: "Назва притулку" }));
    expect(document.activeElement).toBe(screen.getByLabelText("поле"));
  });

  it("an item with its own way in uses it instead of the selector", () => {
    let selected = "";
    render(
      <ErrorSummary
        ref={null}
        items={[{ key: "a", label: "Вид", target: "#a", onSelect: () => (selected = "a") }, city]}
      />,
    );
    fireEvent.click(screen.getByRole("link", { name: "Вид" }));
    expect(selected).toBe("a");
  });
});

describe("errorFocusOf", () => {
  it("sends focus to the summary only with two or more problems, else to the one field", () => {
    expect(errorFocusOf([])).toEqual({ kind: "none" });
    expect(errorFocusOf([name])).toEqual({ kind: "field", item: name });
    expect(errorFocusOf(items)).toEqual({ kind: "summary" });
  });
});
