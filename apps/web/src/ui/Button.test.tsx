import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button, buttonClass, LinkButton } from "./Button";

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

  it("the accent button is the accent-strong fill with the 19px bold cta label at both sizes", () => {
    // White on #D9531A is 3.8:1: only large text passes, so the label token is pinned, not just the fill.
    for (const size of ["md", "lg"] as const) {
      const tokens = buttonClass("accent", size).split(" ");
      expect(tokens).toContain("bg-accent-strong");
      expect(tokens).toContain("text-on-ink");
      expect(tokens).toContain("text-cta");
      expect(tokens).not.toContain("text-label");
      expect(tokens).not.toContain("bg-accent");
      expect(tokens.some((t) => t.startsWith("desktop:text-"))).toBe(false);
    }
    const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8");
    expect(css).toMatch(/--color-accent-strong:\s*#d9531a/i);
    expect(css).toMatch(/--text-cta:\s*19px/);
    expect(css).toMatch(/--text-cta--font-weight:\s*700/);
    expect(buttonClass("primary", "lg")).not.toContain("bg-accent-strong");
  });
});
