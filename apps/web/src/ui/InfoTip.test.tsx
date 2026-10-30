import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { InfoTip } from "./InfoTip";

function Two() {
  return (
    <div>
      <InfoTip label="Перша" closeLabel="Закрити">
        Текст першої підказки
      </InfoTip>
      <InfoTip label="Друга" closeLabel="Закрити">
        Текст другої підказки
      </InfoTip>
      <button type="button">Поза</button>
    </div>
  );
}

const trigger = (name: string) => screen.getByRole("button", { name });

describe("InfoTip", () => {
  it("is closed until pressed, then shows the text and says so", async () => {
    render(<Two />);
    expect(trigger("Перша").getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Текст першої підказки")).toBeNull();
    await userEvent.click(trigger("Перша"));
    expect(trigger("Перша").getAttribute("aria-expanded")).toBe("true");
    expect(trigger("Перша").getAttribute("aria-controls")).toBe(
      screen.getByRole("note", { name: "Перша" }).id,
    );
    expect(screen.getByText("Текст першої підказки")).toBeTruthy();
  });

  it("opens with Enter and Space", async () => {
    render(<Two />);
    trigger("Перша").focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByText("Текст першої підказки")).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    expect(trigger("Перша")).toBe(document.activeElement);
    await userEvent.keyboard(" ");
    expect(screen.getByText("Текст першої підказки")).toBeTruthy();
  });

  it("Esc closes it and focus returns to the trigger", async () => {
    render(<Two />);
    await userEvent.click(trigger("Перша"));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByText("Текст першої підказки")).toBeNull();
    expect(document.activeElement).toBe(trigger("Перша"));
  });

  it("the ✕ closes it and focus returns to the trigger", async () => {
    render(<Two />);
    await userEvent.click(trigger("Перша"));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Закрити" }));
    await userEvent.click(screen.getByRole("button", { name: "Закрити" }));
    expect(screen.queryByText("Текст першої підказки")).toBeNull();
    expect(document.activeElement).toBe(trigger("Перша"));
  });

  it("a press outside closes it", async () => {
    render(<Two />);
    await userEvent.click(trigger("Перша"));
    await userEvent.click(screen.getByRole("button", { name: "Поза" }));
    expect(screen.queryByText("Текст першої підказки")).toBeNull();
  });

  it("the trigger again closes it", async () => {
    render(<Two />);
    await userEvent.click(trigger("Перша"));
    await userEvent.click(trigger("Перша"));
    expect(screen.queryByText("Текст першої підказки")).toBeNull();
    expect(trigger("Перша").getAttribute("aria-expanded")).toBe("false");
  });

  it("only one is open at a time", async () => {
    render(<Two />);
    await userEvent.click(trigger("Перша"));
    await userEvent.click(trigger("Друга"));
    expect(screen.queryByText("Текст першої підказки")).toBeNull();
    expect(screen.getByText("Текст другої підказки")).toBeTruthy();
    expect(trigger("Перша").getAttribute("aria-expanded")).toBe("false");
  });
});
