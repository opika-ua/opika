import { uk } from "@opika/i18n";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { forSheltersMetadata, renderForSheltersPage, whatToPrepareFor } from "./page";

const OFF = { selfRegistration: false };
const ON = { selfRegistration: true };
const INDEPENDENT = "Opika робить одна людина, незалежно. Це не державний і не міський сервіс.";

/** Commitment #6's A1 sentence (§7) and today's §11, as the flag-off page must keep them. */
const A1 = "Доступ до кабінету я надсилаю сам – листом на адресу, яку ви мені вкажете.";
const HOW_TO_START_OFF =
  "Напишіть на hello@opika.org.ua: хто ви і скільки у вас тварин. Після розмови я створю притулок на сайті й надішлю вам доступ до кабінету. Тварин ви додаєте самі. Ті, хто шукає тварину, бачать картки, щойно притулок пройде перевірку – або раніше, з позначкою «на перевірці», якщо я дозволю показ.";
const ACCESS_ON =
  "Кабінет ви створюєте самі – формою на цій сторінці. Якщо зручніше, напишіть мені, і я створю його для вас.";
const HOW_TO_START_ON =
  "Зареєструйте притулок формою на цій сторінці – це займає 3 хвилини. Потім я перевірю притулок, зазвичай до 2 днів. Якщо зручніше, напишіть на hello@opika.org.ua: хто ви і скільки у вас тварин – і я створю притулок сам.";

describe("«Для притулків»", () => {
  it.each([OFF, ON])(
    "states once, in the footer, that it is run by one person, independently (%o)",
    (flags) => {
      render(renderForSheltersPage(false, flags));
      expect(screen.getAllByText(INDEPENDENT)).toHaveLength(1);
      expect(within(screen.getByRole("contentinfo")).getByText(INDEPENDENT)).toBeTruthy();
    },
  );

  /** PW-2, his scope item 1, verbatim: "«Для притулків» page: add «Увійти в кабінет» → /kabinet/vkhid." */
  it("links «Увійти в кабінет» to the kabinet's sign-in page", () => {
    render(renderForSheltersPage(false));
    const link = screen.getByRole("link", { name: "Увійти в кабінет" });
    expect(link.getAttribute("href")).toBe("/kabinet/vkhid");
  });

  it("sets its own canonical (PR B, the SEO review of page titles)", () => {
    expect(forSheltersMetadata(false).alternates?.canonical).toBe("/prytulkam");
    expect(forSheltersMetadata(true).alternates?.canonical).toBe("/prytulkam");
  });
});

describe("/prytulkam's metadata (SEO handoff B2)", () => {
  const title = "Розмістити тварин притулку безкоштовно – Opika";
  const description =
    "Розмістіть тварин свого притулку чи ініціативи на Opika безкоштовно, без реклами й комісій.";

  it("has the approved title, branded once, the same in every preview", () => {
    const metadata = forSheltersMetadata(false);
    expect(metadata.title).toEqual({ absolute: title });
    expect(metadata.openGraph).toMatchObject({ title, siteName: "Opika", locale: "uk_UA" });
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image", title });
  });

  it("says registration takes 3 minutes only while self-registration is on", () => {
    expect(forSheltersMetadata(false).description).toBe(description);
    expect(forSheltersMetadata(false).twitter?.description).toBe(description);
    const on = forSheltersMetadata(true);
    expect(on.description).toBe(`${description} Реєстрація – 3 хвилини.`);
    expect(on.openGraph?.description).toBe(on.description);
  });
});

describe("/prytulkam with self-registration off is the page it was", () => {
  it("keeps A1 in §7 and today's §11, with no rules section and no registration button", () => {
    const { container } = render(renderForSheltersPage(false, OFF));
    expect(container.textContent).toContain(A1);
    expect(screen.getByText(HOW_TO_START_OFF)).toBeTruthy();
    expect(container.textContent).not.toContain(ACCESS_ON);
    expect(container.querySelector("#pravyla")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Правила для притулків" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Зареєструвати притулок" })).toBeNull();
  });
});

describe("/prytulkam with self-registration on (commitment #6's exception)", () => {
  it("swaps A1 for the self-service sentence and nothing else in §7", () => {
    const on = whatToPrepareFor(true);
    expect(on).not.toContain(A1);
    expect(on).toContain(ACCESS_ON);
    expect(on.replace(ACCESS_ON, A1)).toBe(whatToPrepareFor(false));
  });

  it("drops «Як почати»: the form replaces it", () => {
    const { container } = render(renderForSheltersPage(false, ON));
    expect(container.textContent).not.toContain(HOW_TO_START_ON);
    expect(container.textContent).not.toContain(HOW_TO_START_OFF);
    expect(container.textContent).not.toContain(uk.forShelters.headings.howToStart);
  });

  it("keeps «Правила» at #pravyla as a closed question: all six rules and the enforcement", () => {
    const { container } = render(renderForSheltersPage(false, ON));
    const question = container.querySelector("details#pravyla");
    expect(question).not.toBeNull();
    expect(question?.hasAttribute("open")).toBe(false);
    expect(question?.querySelector("summary")?.textContent).toBe("Правила для притулків");
    expect(question?.querySelectorAll("li")).toHaveLength(6);
    expect(question?.textContent).toContain("Opika – не для продажу тварин.");
    expect(question?.textContent).toContain(
      "Якщо правила порушуються, я можу призупинити притулок і напишу вам чому.",
    );
  });

  it("has no «Увійти в кабінет» button at the top: the card's footer signs in", () => {
    render(renderForSheltersPage(false, ON));
    expect(screen.queryByRole("link", { name: uk.forShelters.signInLink })).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: uk.forShelters.title })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: uk.registration.footer.link }).getAttribute("href"),
    ).toBe("/kabinet/vkhid");
  });

  it("explains how it works in three steps", () => {
    render(renderForSheltersPage(false, ON));
    const steps = uk.registration.page.howItWorks.steps;
    for (const step of steps) {
      expect(screen.getByRole("heading", { level: 3, name: step.title })).toBeTruthy();
      expect(screen.getByText(step.body)).toBeTruthy();
    }
  });

  it("every existing section is a closed question with its text verbatim in the HTML", () => {
    const { container } = render(renderForSheltersPage(false, ON));
    const h = uk.forShelters.headings;
    const titles = [...container.querySelectorAll("details > summary")].map((s) => s.textContent);
    expect(titles).toEqual([
      h.cost,
      h.whoContactsWhom,
      h.money,
      h.verification,
      h.whatToPrepare,
      "Правила для притулків",
      h.whatHappensToAnimals,
      h.whyHowOften,
      h.whenAnimalFindsHome,
      h.whatThisIs,
      h.whoIsBehindThis,
      h.howToLeave,
    ]);
    expect(container.querySelectorAll("details[open]")).toHaveLength(0);
    const text = container.textContent ?? "";
    for (const body of [
      uk.forShelters.cost,
      uk.forShelters.money,
      uk.forShelters.verification,
      uk.forShelters.whatHappensToAnimals,
      uk.forShelters.whyHowOften,
      uk.forShelters.whenAnimalFindsHome,
      uk.forShelters.howToLeave,
    ]) {
      expect(text).toContain(body);
    }
    expect(text).toContain(ACCESS_ON);
  });

  it("the hero's jump links point at questions that exist", () => {
    const { container } = render(renderForSheltersPage(false, ON));
    const jump = uk.registration.page.jump;
    for (const label of [jump.verification, jump.rules, jump.questions]) {
      const href = screen.getByRole("link", { name: `${label} ↓` }).getAttribute("href") ?? "";
      expect(container.querySelector(href)).not.toBeNull();
    }
  });
});
