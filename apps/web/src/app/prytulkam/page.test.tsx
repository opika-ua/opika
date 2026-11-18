import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { forSheltersMetadata, renderForSheltersPage, whatToPrepareFor } from "./page";

const OFF = { selfRegistration: false };
const ON = { selfRegistration: true };

/** Commitment #6's A1 sentence (§7) and today's §11, as the flag-off page must keep them. */
const A1 = "Доступ до кабінету я надсилаю сам – листом на адресу, яку ви мені вкажете.";
const HOW_TO_START_OFF =
  "Напишіть на hello@opika.org.ua: хто ви і скільки у вас тварин. Після розмови я створю притулок на сайті й надішлю вам доступ до кабінету. Тварин ви додаєте самі. Ті, хто шукає тварину, бачать картки, щойно притулок пройде перевірку – або раніше, з позначкою «на перевірці», якщо я дозволю показ.";
const ACCESS_ON =
  "Кабінет ви створюєте самі – формою на цій сторінці. Якщо зручніше, напишіть мені, і я створю його для вас.";
const HOW_TO_START_ON =
  "Зареєструйте притулок формою на цій сторінці – це займає 3 хвилини. Потім я перевірю притулок, зазвичай до 2 днів. Якщо зручніше, напишіть на hello@opika.org.ua: хто ви і скільки у вас тварин – і я створю притулок сам.";

describe("«Для притулків»", () => {
  it("states it is run by one person, independent of any state or city service", () => {
    render(renderForSheltersPage(false));
    expect(
      screen.getByText("Opika робить одна людина, незалежно. Це не державний і не міський сервіс."),
    ).toBeTruthy();
  });

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
  const title = "Розмістити тварин притулку безкоштовно | Opika";
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

  it("says how to start with the form, keeping the write-to-me path", () => {
    render(renderForSheltersPage(false, ON));
    expect(screen.getByText(HOW_TO_START_ON)).toBeTruthy();
    expect(screen.queryByText(HOW_TO_START_OFF)).toBeNull();
  });

  it("shows «Правила» at #pravyla, all six rules and what happens when they are broken", () => {
    const { container } = render(renderForSheltersPage(false, ON));
    const section = container.querySelector("#pravyla");
    expect(section).not.toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Правила для притулків" })).toBeTruthy();
    expect(section?.querySelectorAll("li")).toHaveLength(6);
    expect(section?.textContent).toContain("Opika – не для продажу тварин.");
    expect(section?.textContent).toContain(
      "Якщо правила порушуються, я можу призупинити притулок і напишу вам чому.",
    );
  });

  it("repeats «Зареєструвати притулок» at the end, pointing at the form's anchor", () => {
    render(renderForSheltersPage(false, ON));
    // The last on the page: the registration slot may hold its own anchor button above.
    const button = screen.getAllByRole("link", { name: "Зареєструвати притулок" }).at(-1);
    expect(button?.getAttribute("href")).toBe("#reyestratsiia");
  });
});
