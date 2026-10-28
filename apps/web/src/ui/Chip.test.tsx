import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Chip } from "./Chip";

describe("Chip", () => {
  it("option: a real checkbox or radio inside a label, so a GET form submits it", () => {
    render(
      <>
        <Chip kind="option" type="checkbox" name="age" value="baby" defaultChecked>
          Малюки
        </Chip>
        <Chip kind="option" type="radio" name="sex" value="male">
          Хлопчик
        </Chip>
      </>,
    );
    const box = screen.getByRole("checkbox", { name: "Малюки" }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(box.name).toBe("age");
    expect(box.value).toBe("baby");
    expect(screen.getByRole("radio", { name: "Хлопчик" })).toBeTruthy();
  });

  it("toggle: state is aria-pressed and the press reaches the handler", () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <Chip kind="toggle" pressed={false} onClick={onClick}>
        Тільки собаки
      </Chip>,
    );
    const button = screen.getByRole("button", { name: "Тільки собаки" });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(
      <Chip kind="toggle" pressed onClick={onClick}>
        Тільки собаки
      </Chip>,
    );
    expect(button.getAttribute("aria-pressed")).toBe("true");
  });

  it("link: marks the current page", () => {
    render(
      <>
        <Chip kind="link" href="/a" current>
          A
        </Chip>
        <Chip kind="link" href="/b">
          B
        </Chip>
      </>,
    );
    expect(screen.getByRole("link", { name: "A" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "B" }).hasAttribute("aria-current")).toBe(false);
  });

  it("info and status are text, not controls", () => {
    render(
      <>
        <Chip kind="info">Середній</Chip>
        <Chip kind="status" tone="ink">
          Резерв
        </Chip>
      </>,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Середній")).toBeTruthy();
    expect(screen.getByText("Резерв")).toBeTruthy();
  });
});
