/**
 * Self-registration's form on /prytulkam (spec §13.1), on the harness's second server: the only
 * one started with `SELF_REGISTRATION_ENABLED=1` (`playwright.config.ts`, project
 * "self-registration"), so every other spec sees /prytulkam as production does. Sign-in is off
 * there too, so a submit can't register: these cover how the form posts and stays, never the
 * way out, which `register.test.ts` (the 303) and `RegistrationForm.test.tsx` pin.
 */
import { expect, type Page, test } from "@playwright/test";

test.use({
  extraHTTPHeaders: { "x-forwarded-for": "198.51.100.123" },
  viewport: { width: 1440, height: 900 },
});

type Marked = Window & { __beforeClick?: boolean };

/** React has hydrated the element. */
async function hydrated(page: Page, selector: string): Promise<void> {
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    return el !== null && Object.keys(el).some((key) => key.startsWith("__reactFiber"));
  }, selector);
}

async function markDocument(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as Marked).__beforeClick = true;
  });
}

test.describe("/prytulkam's registration form", () => {
  const form = (page: Page) => page.locator("#reyestratsiia form");

  async function fillStepOne(page: Page): Promise<void> {
    await page.getByLabel("Назва притулку чи ініціативи").fill("Притулок «Тестовий хвіст»");
    await page.getByLabel("Сайт або сторінка в соцмережі").fill("instagram.com/prytulok_test");
    await page.getByLabel("Телефон або Telegram для людей").fill("@prytulok_test");
  }

  async function fillStepTwo(page: Page): Promise<void> {
    await page.getByLabel("Email").fill("olena@example.org");
    await page.getByLabel("Пароль", { exact: true }).fill("ялинка-під-вікном-у-грудні");
    await page.getByLabel("Повторіть пароль").fill("ялинка-під-вікном-у-грудні");
  }

  async function fill(page: Page): Promise<void> {
    await fillStepOne(page);
    await fillStepTwo(page);
  }

  test("with JS: a refused submit stays in the same document, nothing in the URL", async ({
    page,
  }) => {
    await page.goto("/prytulkam", { waitUntil: "load" });
    await expect(form(page)).toBeVisible();
    await hydrated(page, "#reyestratsiia form button[type='submit']");
    // With JS the card is two steps: «Далі» checks step 1 (a city picked) before step 2 shows.
    await fillStepOne(page);
    await page.getByRole("combobox", { name: "Місто" }).fill("Київ");
    await page.getByRole("option", { name: /^Київ/ }).first().click();
    await page.getByRole("button", { name: "Далі" }).click();
    await expect(page.getByRole("heading", { name: "Крок 2 з 2 · Ваш акаунт" })).toBeFocused();
    await fillStepTwo(page);
    await markDocument(page);
    // Straight away: under the minimum fill time, so the server refuses with the generic line.
    await page.getByRole("button", { name: "Зареєструвати притулок" }).click();
    await expect(page.getByText("Не вдалося зареєструвати.", { exact: false })).toBeVisible();
    expect(await page.evaluate(() => (window as Marked).__beforeClick === true)).toBe(true);
    expect(new URL(page.url()).pathname).toBe("/prytulkam");
    expect(new URL(page.url()).search).toBe("");
  });

  test("without JS: the form posts natively and the page answers in place", async ({ browser }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      extraHTTPHeaders: { "x-forwarded-for": "198.51.100.122" },
    });
    const page = await context.newPage();
    try {
      await page.goto("/prytulkam", { waitUntil: "load" });
      // No JS: the city is a plain text field, matched on the server.
      await page.getByLabel("Місто").fill("Київ");
      await fill(page);
      const posted = page.waitForRequest(
        (request) => request.isNavigationRequest() && request.method() === "POST",
      );
      await page.getByRole("button", { name: "Зареєструвати притулок" }).click();
      const request = await posted;
      expect(new URL(request.url()).pathname).toBe("/prytulkam");
      expect(new URL(request.url()).search).toBe("");
      await page.waitForLoadState("load");
      await expect(page.getByText("Не вдалося зареєструвати.", { exact: false })).toBeVisible();
      expect(new URL(page.url()).search).toBe("");
      // What was typed survives the round trip (never the passwords).
      await expect(page.getByLabel("Email")).toHaveValue("olena@example.org");
      await expect(page.getByLabel("Пароль", { exact: true })).toHaveValue("");
    } finally {
      await context.close();
    }
  });
});
