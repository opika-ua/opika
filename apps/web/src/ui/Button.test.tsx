import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button, LinkButton } from "./Button";

describe("Button", () => {
  it("is a button of type button by default, named by its content", () => {
    render(<Button>Дати сімʼю</Button>);
    const button = screen.getByRole("button", { name: "Дати сімʼю" });
    expect(button.getAttribute("type")).toBe("button");
  });

  it("an icon button is named by aria-label", () => {
    render(
      <Button variant="icon" aria-label="Закрити">
        <span aria-hidden="true">x</span>
      </Button>,
    );
    expect(screen.getByRole("button", { name: "Закрити" })).toBeTruthy();
  });

  it("loading announces busy, stays focusable, ignores presses and cannot submit", () => {
    const onClick = vi.fn();
    render(
      <Button status="loading" onClick={onClick}>
        Зберегти
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Зберегти" });
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.hasAttribute("disabled")).toBe(false);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("idle passes the press through; disabled is native", () => {
    const onClick = vi.fn();
    render(
      <>
        <Button onClick={onClick}>Так</Button>
        <Button disabled>Ні</Button>
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Так" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("button", { name: "Ні" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("LinkButton", () => {
  it("is a real link, so navigation works without JS", () => {
    render(<LinkButton href="/tvaryny">До списку</LinkButton>);
    expect(screen.getByRole("link", { name: "До списку" }).getAttribute("href")).toBe("/tvaryny");
  });
});
