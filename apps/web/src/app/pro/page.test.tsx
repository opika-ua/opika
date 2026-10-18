import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AboutPage from "./page";

describe("AboutPage", () => {
  it("renders the required subjects, including the analytics disclosure", () => {
    render(<AboutPage />);

    expect(screen.getByRole("heading", { name: "Про проєкт" })).toBeTruthy();
    expect(
      screen.getByText(/Opika — сайт, де тварини з притулків Київщини шукають дім\./),
    ).toBeTruthy();
    expect(screen.getByText(/Сайт безкоштовний для притулків сьогодні/)).toBeTruthy();
    expect(screen.getByText(/Opika ніколи не бере участі в грошах/)).toBeTruthy();
    expect(screen.getByText(/Дані, які вносить притулок/)).toBeTruthy();
    expect(
      screen.getByText(
        "Сайт збирає базову статистику відвідувань — скільки людей заходить і наскільки швидко працюють сторінки — без реклами.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Зв'язатися з розробником: hello@opika.org.ua")).toBeTruthy();
  });

  /**
   * KH-C1 (row 90, Oleksii's final yes 2026-10-14; ships with #94): the
   * kabinet addition closes the data paragraph, in the same paragraph.
   * Transcribed from his text, never read from `uk.ts`.
   */
  it("the data paragraph ends with the kabinet addition", () => {
    render(<AboutPage />);
    const data = screen.getByText(/Дані, які вносить притулок/);
    expect(data.tagName).toBe("P");
    expect(
      data.textContent?.endsWith(
        "Притулок може попросити видалити свій запис у будь-який момент. Для притулків із доступом до кабінету реєстр зберігає ім'я та адресу пошти адміністратора — щоб надсилати посилання для входу, — а також технічний запис про браузер і пристрій, з якого виконано вхід. IP-адреси не зберігаються. Адреси, введені у формі входу, і записи про входи, що втратили силу, видаляються протягом двох діб.",
      ),
    ).toBe(true);
  });

  it("the header wordmark links back to the gallery and shows a real focus-visible outline", () => {
    render(<AboutPage />);

    const link = screen.getByRole("link", { name: "Opika" });
    expect(link.getAttribute("href")).toBe("/tvaryny");
    expect(link.className).toContain("focus-visible:outline");
  });
});
