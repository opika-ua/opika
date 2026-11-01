import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { metadata, renderAboutPage } from "./page";

describe("AboutPage", () => {
  it("sets its own canonical (PR B, the SEO review of page titles)", () => {
    expect(metadata.alternates?.canonical).toBe("/pro");
  });

  it("credits the codifier in «Джерела даних», with both links named", () => {
    const { container } = render(renderAboutPage(false));
    const heading = screen.getByRole("heading", { level: 2, name: "Джерела даних" });
    expect(heading.closest("section")?.id).toBe("dzherela-danykh");
    expect(container.querySelector("#dzherela-danykh")).not.toBeNull();
    expect(screen.getByText(/^Перелік населених пунктів узято з «Кодифікатора/).textContent).toBe(
      "Перелік населених пунктів узято з «Кодифікатора адміністративно-територіальних одиниць та територій територіальних громад» (Мінрозвитку).",
    );
    expect(
      screen.getByRole("link", { name: "Набір даних на data.gov.ua" }).getAttribute("href"),
    ).toBe("https://data.gov.ua/dataset/43c2a113-a032-4c8a-a409-3b5e1660bb38");
    expect(
      screen
        .getByRole("link", { name: "Ліцензія Creative Commons Attribution" })
        .getAttribute("href"),
    ).toBe("http://www.opendefinition.org/licenses/cc-by");
    expect(screen.getByText("Редакція від 7 липня 2026 року (наказ № 1321).")).toBeTruthy();
    expect(screen.getByText(/^Зміни: додано латинську транслітерацію/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/CC BY 4\.0/);
  });

  it("the section comes after the analytics paragraph and before the contact line", () => {
    render(renderAboutPage(false));
    const order = (el: HTMLElement) => el.compareDocumentPosition.bind(el);
    const analytics = screen.getByText(/^Сайт збирає базову статистику/);
    const heading = screen.getByRole("heading", { name: "Джерела даних" });
    const contact = screen.getByText(/^Написати мені:/);
    expect(order(analytics)(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(order(heading)(contact) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders the required subjects, including the analytics disclosure", () => {
    render(renderAboutPage(false));

    expect(screen.getByRole("heading", { name: "Про проєкт" })).toBeTruthy();
    expect(
      screen.getByText(/Opika – сайт, де тварини з притулків України шукають дім\./),
    ).toBeTruthy();
    expect(screen.getByText(/Сайт безкоштовний для притулків, без платних тарифів/)).toBeTruthy();
    expect(screen.getByText(/Opika ніколи не бере участі в грошах/)).toBeTruthy();
    expect(screen.getByText(/Дані, які вносить притулок/)).toBeTruthy();
    expect(
      screen.getByText(
        "Сайт збирає базову статистику відвідувань – скільки людей заходить і наскільки швидко працюють сторінки – без реклами.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Написати мені: hello@opika.org.ua")).toBeTruthy();
  });

  /**
   * His PR 6 text (pr6-copy-uk.md §1.5): the kabinet's history and photo
   * facts close the data paragraph, in the same paragraph. Transcribed from
   * his text, never read from `uk.ts`, with the one clause his VP-T1 answer
   * (KH-Q12) changed: «…видаляються протягом доби.», and PW-1's two sentences (his copy,
   * `docs/shelter-passwords-copy-uk.md` §G): the password hash and the session's length.
   */
  it("the data is six paragraphs, the saved list's own sentence last (S8, DR1-Q4)", () => {
    render(renderAboutPage(false));
    // Audit 2026-10-22 #4 and #45: the same sentences in four paragraphs, not one.
    const history = screen.getByText(/^Кожна зміна в кабінеті записується/);
    expect(history.tagName).toBe("P");
    expect(history.textContent?.endsWith("Історія видаляється разом із записом притулку.")).toBe(
      true,
    );
    const photos = screen.getByText(/^Фото, завантажені в кабінеті/);
    expect(photos.tagName).toBe("P");
    expect(photos.textContent).toBe(
      "Фото, завантажені в кабінеті, зберігаються без даних про місце зйомки, за адресами, які неможливо вгадати. Фото, прибране з картки, більше не показується, а сам файл я видаляю на прохання притулку.",
    );
    const savedList = screen.getByText(/^Список збережених тварин/);
    expect(savedList.tagName).toBe("P");
    expect(savedList.textContent).toBe(
      "Список збережених тварин зберігається лише в цьому браузері. Щоб показати його актуальним, сайт запитує дані про цих тварин без кукі й не зберігає, яких саме.",
    );
    const sessions = screen.getByText(/^Для притулків із доступом до кабінету/);
    expect(sessions.textContent).toContain(
      "щоб надсилати запрошення, посилання для входу чи нового пароля і повідомлення про зміну пароля, а також технічний запис",
    );
    // GDPR-F1 (2026-10-24): the departed-admin erasure sentence, its own paragraph
    // between the kabinet-access one above and the history one below.
    const erasure = screen.getByText(/^Коли адміністратора притулку прибирають із кабінету/);
    expect(erasure.tagName).toBe("P");
    expect(erasure.textContent).toBe(
      "Коли адміністратора притулку прибирають із кабінету, скасовують його запрошення або запрошення так і не прийняли, обліковий запис і адреса пошти видаляються, якщо ця адреса не має доступу до іншого притулку і не запрошена до нього. Тоді ж адресу прибирають з історії притулку: там лишається лише запис про те, що адміністратора запрошено, додано чи прибрано.",
    );
  });

  it("the header wordmark links back to the gallery", () => {
    render(renderAboutPage(false));

    const link = screen.getByRole("link", { name: "Opika" });
    expect(link.getAttribute("href")).toBe("/tvaryny");
  });
});
