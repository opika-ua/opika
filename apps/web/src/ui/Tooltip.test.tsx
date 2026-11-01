import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Tooltip } from "./Tooltip";

function Subject() {
  return (
    <div>
      <Tooltip text="Прибрати зі збережених">
        <button type="button" aria-label="Прибрати зі збережених">
          x
        </button>
      </Tooltip>
      <button type="button">Поза</button>
    </div>
  );
}

const control = () => screen.getByRole("button", { name: "Прибрати зі збережених" });

describe("Tooltip", () => {
  it("shows on mouse hover and goes when the pointer leaves", () => {
    render(<Subject />);
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.pointerEnter(control(), { pointerType: "mouse" });
    expect(screen.getByRole("tooltip").textContent).toBe("Прибрати зі збережених");
    fireEvent.pointerLeave(control(), { pointerType: "mouse" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("shows on keyboard focus and goes on blur", async () => {
    render(<Subject />);
    await userEvent.tab();
    expect(document.activeElement).toBe(control());
    expect(screen.getByRole("tooltip")).toBeTruthy();
    await userEvent.tab();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("does not open on touch, and Esc closes it", () => {
    render(<Subject />);
    fireEvent.pointerEnter(control(), { pointerType: "touch" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.pointerEnter(control(), { pointerType: "mouse" });
    expect(screen.getByRole("tooltip")).toBeTruthy();
    act(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("is not linked to the control, so the name is read once", () => {
    render(<Subject />);
    fireEvent.pointerEnter(control(), { pointerType: "mouse" });
    expect(control().getAttribute("aria-describedby")).toBeNull();
  });
});
