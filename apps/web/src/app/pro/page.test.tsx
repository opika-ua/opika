import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectOgUrlIsCanonical } from "../../seo/og-url-assert";
import { metadata, renderAboutPage } from "./page";

describe("AboutPage", () => {
  it("states in one line that it is run by one person, independent of any state or city service", () => {
    render(renderAboutPage(false));
    expect(
      screen.getByText(
        "Opika – сайт, де тварини з притулків України шукають дім. Його робить одна людина, у вільний від роботи час і незалежно: немає команди й інвестора. Це не державний і не міський сервіс.",
      ),
    ).toBeTruthy();
    // The short line is the site footer's, not this page's content.
    expect(
      within(screen.getByRole("main")).queryByText(/робить одна людина, незалежно/),
    ).toBeNull();
  });

  it("sets its own canonical (PR B, the SEO review of page titles)", () => {
    expectOgUrlIsCanonical(metadata, "/pro");
  });

  it("sets the approved title and description (SEO handoff B2), the same in every preview", () => {
    const title = "Про Opika – сайт, де тварини з притулків шукають дім";
    const description =
      "Opika робить одна людина, у вільний від роботи час: без реклами, без інвесторів, безкоштовно для притулків.";
    expect(metadata.title).toEqual({ absolute: title });
    expect(metadata.description).toBe(description);
    expect(metadata.openGraph).toMatchObject({
      title,
      description,
      siteName: "Opika",
      locale: "uk_UA",
    });
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image", title, description });
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
    expect(screen.getByText(/^Коротко: я не продаю дані/)).toBeTruthy();
    expect(
      screen.getByText(
        "Сайт збирає базову статистику відвідувань – скільки людей заходить і наскільки швидко працюють сторінки – без реклами.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Написати мені: hello@opika.org.ua")).toBeTruthy();
  });

  it("the header wordmark links back to the gallery", () => {
    render(renderAboutPage(false));

    const link = within(screen.getByRole("banner")).getByRole("link", { name: "Opika" });
    expect(link.getAttribute("href")).toBe("/");
  });
});

/** The owner's shrink (2026-11-20): a summary at #dani, then the link to the privacy policy. */
describe("/pro's data summary", () => {
  it("keeps #dani on the summary, so old links still land", () => {
    const { container } = render(renderAboutPage(false));
    expect(container.querySelectorAll("#dani")).toHaveLength(1);
    expect(container.querySelector("#dani")?.textContent).toBe(
      "Коротко: я не продаю дані й не показую реклами. Людині, яка шукає тварину, не потрібен обліковий запис – сайт ставить одне кукі, лише коли ви відкриваєте контакти притулку. Притулки дають стільки даних, скільки потрібно для перевірки й кабінету; точна адреса притулку й пошта адміністраторів публічно не показуються.",
    );
  });

  it("links to the privacy policy in «Усе докладно – у політиці конфіденційності.»", () => {
    render(renderAboutPage(false));
    const link = screen.getByRole("link", { name: "політиці конфіденційності" });
    expect(link.getAttribute("href")).toBe("/polityka-konfidentsiinosti");
    expect(link.closest("p")?.textContent).toBe("Усе докладно – у політиці конфіденційності.");
  });

  it("no longer carries the detailed paragraphs the policy now holds", () => {
    render(renderAboutPage(false));
    expect(screen.queryByText(/^Кожна зміна в кабінеті записується/)).toBeNull();
    expect(screen.queryByText(/^Якщо на сайті стається збій/)).toBeNull();
    expect(screen.queryByText(/^Коли притулок реєструється/)).toBeNull();
  });
});
