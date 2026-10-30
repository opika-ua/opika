import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KabinetHeader } from "./KabinetHeader";
import { KabinetNav } from "./KabinetNav";

describe("KabinetHeader", () => {
  it("names the surface with a «Кабінет» tag beside the logo's accessible name", () => {
    render(<KabinetHeader shelterName="Домівка" viewer="admin" />);
    expect(screen.getByText("Opika")).toBeTruthy();
    expect(screen.getByText("Кабінет")).toBeTruthy();
  });

  it("«Переглянути сайт» opens the public gallery in a new tab and says so to screen readers", () => {
    render(<KabinetHeader shelterName="Домівка" viewer="admin" />);
    const link = screen.getByRole("link", {
      name: "Переглянути сайт (відкриється в новій вкладці)",
    });
    expect(link.getAttribute("href")).toBe("/tvaryny");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("shows the shelter's name and the role, and a working «Вийти» for an admin", () => {
    render(<KabinetHeader shelterName="Домівка" viewer="admin" />);
    expect(screen.getByText("Домівка")).toBeTruthy();
    expect(screen.getByText("адміністратор притулку")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Вийти" })).toBeTruthy();
  });

  it("the support view has no sign-out button", () => {
    render(<KabinetHeader shelterName="Домівка" viewer="support" />);
    expect(screen.queryByRole("button", { name: "Вийти" })).toBeNull();
    expect(screen.getByText("Вихід вимкнено")).toBeTruthy();
  });
});

describe("KabinetNav", () => {
  it("has two tabs, Тварини then Притулок, and no Головна", () => {
    render(<KabinetNav current="animals" animalList />);
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Тварини",
      "Притулок",
    ]);
    expect(screen.queryByRole("link", { name: "Головна" })).toBeNull();
    expect(screen.getByRole("link", { name: "Тварини" }).getAttribute("aria-current")).toBe("page");
  });
});
