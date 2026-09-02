import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AboutPage from "./page";

describe("AboutPage", () => {
  it("renders the required subjects, including the analytics disclosure", () => {
    render(<AboutPage />);

    expect(screen.getByRole("heading", { name: "Про проєкт" })).toBeTruthy();
    expect(screen.getByText(/Opika — реєстр тварин притулків Київщини/)).toBeTruthy();
    expect(screen.getByText(/Реєстр безкоштовний для притулків сьогодні/)).toBeTruthy();
    expect(screen.getByText(/Opika ніколи не бере участі в грошах/)).toBeTruthy();
    expect(screen.getByText(/Дані, які вносить притулок/)).toBeTruthy();
    expect(
      screen.getByText(
        "Реєстр збирає базову статистику відвідувань — скільки людей заходить і наскільки швидко працюють сторінки — без кукі і без реклами.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Зв'язатися з розробником: hello@opika.org.ua")).toBeTruthy();
  });

  it("the header wordmark links back to the gallery and shows a real focus-visible outline", () => {
    render(<AboutPage />);

    const link = screen.getByRole("link", { name: "Opika" });
    expect(link.getAttribute("href")).toBe("/tvaryny");
    expect(link.className).toContain("focus-visible:outline");
  });
});
