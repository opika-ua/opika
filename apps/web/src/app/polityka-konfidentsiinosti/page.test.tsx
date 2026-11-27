import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectOgUrlIsCanonical } from "../../seo/og-url-assert";
import { metadata, renderPrivacyPage } from "./page";

/** Transcribed from the approved copy table, never read from the catalogue. */
const HEADINGS = [
  "Коротко",
  "Якщо ви шукаєте тварину",
  "Якщо ви реєструєте притулок",
  "Якщо у вас є кабінет притулку",
  "Що бачать інші",
  "Хто ще обробляє дані",
  "На якій підставі",
  "Ваші права і як видалити дані",
];

describe("the privacy policy page", () => {
  it("has one h1 and every section as an h2, in the approved order", () => {
    render(renderPrivacyPage(false, { selfRegistration: true }));
    const h1 = screen.getAllByRole("heading", { level: 1 });
    expect(h1.map((heading) => heading.textContent)).toEqual(["Політика конфіденційності"]);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(
      HEADINGS,
    );
  });

  it("names the controller and the date it was updated", () => {
    render(renderPrivacyPage(false));
    expect(screen.getByText(/^Opika робить одна людина – я, Олексій Колотенко\./)).toBeTruthy();
    expect(screen.getByText("Оновлено 20 листопада 2026 р.")).toBeTruthy();
  });

  it("says the opened-contact records are deleted after 90 days", () => {
    render(renderPrivacyPage(false));
    expect(screen.getByText(/Ці записи видаляються через 90 днів\.$/)).toBeTruthy();
  });

  it("follows the mail log with the email logo paragraph, the brand filled in", () => {
    render(renderPrivacyPage(false));
    const section = screen
      .getByRole("heading", { name: "Якщо у вас є кабінет притулку" })
      .closest("section") as HTMLElement;
    const mailLog = within(section).getByText(/^Щоб кожен лист надходив лише раз/);
    const logo = within(section).getByText(
      "У листах від Opika є лише одне зображення з сайту – логотип, однаковий для всіх і без жодних міток. Коли поштова програма його показує, хостинг Vercel, як і для будь-якого запиту, записує в технічний журнал IP-адресу й час. Я не використовую це, щоб дізнатися, хто відкрив лист.",
    );
    expect(mailLog.nextElementSibling).toBe(logo);
  });

  it("shows the registration section only while self-registration is on", () => {
    const off = render(renderPrivacyPage(false, { selfRegistration: false }));
    expect(screen.queryByRole("heading", { name: "Якщо ви реєструєте притулок" })).toBeNull();
    off.unmount();
    render(renderPrivacyPage(false, { selfRegistration: true }));
    const section = screen
      .getByRole("heading", { name: "Якщо ви реєструєте притулок" })
      .closest("section") as HTMLElement;
    expect(within(section).getByText(/^Коли притулок реєструється/)).toBeTruthy();
    expect(within(section).getByText(/^Пароль зберігається лише як незворотний хеш/)).toBeTruthy();
  });

  it("links every address to the operator's mailbox", () => {
    render(renderPrivacyPage(false));
    const links = within(screen.getByRole("main")).getAllByRole("link", {
      name: "hello@opika.org.ua",
    });
    expect(links).toHaveLength(3);
    for (const link of links) expect(link.getAttribute("href")).toBe("mailto:hello@opika.org.ua");
  });

  it("lists the six processors, one entry each, in order", () => {
    render(renderPrivacyPage(false));
    const section = screen
      .getByRole("heading", { name: "Хто ще обробляє дані" })
      .closest("section") as HTMLElement;
    const items = within(section)
      .getAllByRole("listitem")
      .map((item) => item.textContent?.split(" – ")[0]);
    expect(items).toEqual(["Vercel", "Neon", "Cloudflare", "Resend", "Upstash", "Sentry"]);
  });

  it("marks no header entry as the current page, and the footer links here", () => {
    render(renderPrivacyPage(false));
    expect(screen.getByRole("banner").querySelector("[aria-current]")).toBeNull();
    const footer = screen.getByRole("contentinfo");
    expect(
      within(footer).getByRole("link", { name: "Політика конфіденційності" }).getAttribute("href"),
    ).toBe("/polityka-konfidentsiinosti");
  });
});

describe("the privacy policy's metadata", () => {
  it("is titled «Політика конфіденційності – Opika» with its own canonical", () => {
    expect(metadata.title).toEqual({ absolute: "Політика конфіденційності – Opika" });
    expect(metadata.openGraph).toMatchObject({ title: "Політика конфіденційності – Opika" });
    expectOgUrlIsCanonical(metadata, "/polityka-konfidentsiinosti");
  });

  it("describes the page in 120 to 160 characters, in every preview", () => {
    const description = metadata.description ?? "";
    expect([...description].length).toBeGreaterThanOrEqual(120);
    expect([...description].length).toBeLessThanOrEqual(160);
    expect(metadata.openGraph).toMatchObject({ description });
    expect(metadata.twitter).toMatchObject({ description, card: "summary_large_image" });
  });
});
