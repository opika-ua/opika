import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ActionPill, type ActionPillAction } from "./ActionPill";

const ready = (label: string, onClick = vi.fn()): ActionPillAction => ({
  id: label,
  kind: "ready",
  icon: "close",
  label,
  onClick,
});

describe("ActionPill", () => {
  it("one named button per action, in order, each pressed once", async () => {
    const crop = vi.fn();
    const remove = vi.fn();
    render(
      <ActionPill
        actions={[
          { ...ready("Обрізати фото 1", crop), icon: "crop" },
          ready("Прибрати фото 1", remove),
        ]}
      />,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Обрізати фото 1",
      "Прибрати фото 1",
    ]);
    await userEvent.click(buttons[0] as HTMLElement);
    expect(crop).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalled();
    await userEvent.click(buttons[1] as HTMLElement);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("Tab visits the actions in order", async () => {
    render(<ActionPill actions={[ready("Перша"), ready("Друга")]} />);
    await userEvent.tab();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Перша");
    await userEvent.tab();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Друга");
  });

  it("a blocked action stays focusable, says why, and does nothing", async () => {
    render(
      <>
        <ActionPill
          actions={[
            { id: "remove", kind: "blocked", icon: "close", label: "Прибрати", reasonId: "why" },
          ]}
        />
        <p id="why">Одне фото має лишитися.</p>
      </>,
    );
    const button = screen.getByRole("button", { name: "Прибрати" });
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.getAttribute("aria-describedby")).toBe("why");
    await userEvent.tab();
    expect(document.activeElement).toBe(button);
    await userEvent.click(button);
    expect(screen.getByRole("button", { name: "Прибрати" })).toBe(button);
  });

  it("onIntent runs when the pointer comes over or focus arrives", () => {
    const onIntent = vi.fn();
    render(<ActionPill actions={[{ ...ready("Обрізати"), onIntent }]} />);
    const button = screen.getByRole("button", { name: "Обрізати" });
    fireEvent.pointerEnter(button);
    fireEvent.focus(button);
    expect(onIntent).toHaveBeenCalledTimes(2);
  });

  it("the given id lands on the button, so focus can be given back to it", () => {
    render(<ActionPill actions={[{ ...ready("Обрізати"), buttonId: "crop-1" }]} />);
    expect(document.getElementById("crop-1")).toBe(
      screen.getByRole("button", { name: "Обрізати" }),
    );
  });

  it("describedBy is added to every button, after a blocked action's own reason", () => {
    render(
      <ActionPill
        describedBy="keys"
        actions={[
          ready("Обрізати"),
          { id: "remove", kind: "blocked", icon: "close", label: "Прибрати", reasonId: "why" },
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: "Обрізати" }).getAttribute("aria-describedby")).toBe(
      "keys",
    );
    expect(screen.getByRole("button", { name: "Прибрати" }).getAttribute("aria-describedby")).toBe(
      "why keys",
    );
  });

  it("onKeyDown hears a key on any button, with that button's action", () => {
    const onKeyDown = vi.fn();
    render(<ActionPill onKeyDown={onKeyDown} actions={[ready("Перша"), ready("Друга")]} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Друга" }), {
      key: "ArrowLeft",
      altKey: true,
    });
    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(onKeyDown.mock.calls[0]?.[0].key).toBe("ArrowLeft");
    expect(onKeyDown.mock.calls[0]?.[1].label).toBe("Друга");
  });

  it("no actions, no pill", () => {
    const { container } = render(<ActionPill actions={[]} />);
    expect(container.innerHTML).toBe("");
  });
});
