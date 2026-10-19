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
   * His PR 6 text (pr6-copy-uk.md §1.5): the kabinet's history and photo
   * facts close the data paragraph, in the same paragraph. Transcribed from
   * his text, never read from `uk.ts`, with the one clause his VP-T1 answer
   * (KH-Q12) changed: «…видаляються протягом доби.»
   */
  it("the data paragraph ends with the kabinet's history and photo facts", () => {
    render(<AboutPage />);
    const data = screen.getByText(/Дані, які вносить притулок/);
    expect(data.tagName).toBe("P");
    expect(
      data.textContent?.endsWith(
        "Притулок може попросити видалити свій запис у будь-який момент. Для притулків із доступом до кабінету сайт зберігає імʼя та адресу пошти адміністратора — щоб надсилати посилання для входу, — а також технічний запис про браузер і пристрій, з якого виконано вхід. IP-адреси не зберігаються. Адреси, введені у формі входу, і записи про входи, що втратили силу, видаляються протягом доби. Кожна зміна в кабінеті записується в історію притулку: коли її зроблено і хто — адміністратор притулку чи я. Натискання «Ще шукає» чи «Ще домовляються» в історію не потрапляють — їх видно з дати на картці. Для профілю зберігаються попереднє й нове значення, для карток тварин — лише те, які поля змінено. Про людей, які шукають тварину, в історії нічого немає. Історія видаляється разом із записом притулку. Фото, завантажені в кабінеті, зберігаються без даних про місце зйомки, за адресами, які неможливо вгадати. Фото, прибране з картки, більше не показується, а сам файл я видаляю на прохання притулку.",
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
