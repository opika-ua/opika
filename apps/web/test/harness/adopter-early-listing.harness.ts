/**
 * Listing before verification, end to end: the operator is refused without evidence, adds a site
 * visit, allows the listing, an adopter sees the «на перевірці» label, the operator revokes (the
 * pages close), and the second allowance asks for a written reason. Fictional pending shelter with
 * no evidence, created in the harness database; every step after that is a real operator action.
 * The per-page `noindex` is not asserted here: the pre-launch flag makes every page noindex, so it
 * cannot be observed in a browser (`post-flip-noindex.test.ts` covers it). Own `x-forwarded-for` (.72).
 */

import { expect, test } from "@playwright/test";
import {
  adopterContext,
  createFixture,
  HARNESS_DATABASE_URL,
  LOCATION_ENV,
  signedIn,
} from "./fictional-shelter";
import { startSignInServer } from "./sign-in-server";

const FORWARDED_FOR = "198.51.100.72";
test.use({ extraHTTPHeaders: { "x-forwarded-for": FORWARDED_FOR }, trace: "off" });

const ALLOW = "Дозволити показ до завершення перевірки";

test("early listing: evidence minimum, label, revoke, re-allow with a note", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const server = await startSignInServer(HARNESS_DATABASE_URL, LOCATION_ENV);
  const fixture = await createFixture("early", (_operatorId, now) => ({
    status: "pending",
    submittedAt: now,
    evidence: { submittedAt: now, items: [] },
  }));
  const operator = await signedIn(browser, server, fixture.operatorEmail, FORWARDED_FOR);
  const adopter = await adopterContext(browser, server, FORWARDED_FOR);
  try {
    const animalPath = `/tvaryny/${fixture.animalId}`;
    const pub = await adopter.newPage();
    expect((await pub.goto(animalPath))?.status()).toBe(404);

    const page = await operator.newPage();
    await page.goto(`/kabinet/prytulky/${fixture.shelterId}`);
    const confirmAllow = async () => {
      await page.getByRole("button", { name: ALLOW }).click();
      return page.getByRole("dialog", { name: ALLOW });
    };

    let dialog = await confirmAllow();
    await dialog.getByRole("button", { name: ALLOW }).click();
    await expect(
      page.getByText("Щоб дозволити показ, потрібен хоча б візит на місце або одна рекомендація."),
    ).toBeVisible();

    await page.getByLabel("Тип доказу").selectOption({ label: "Візит на місце" });
    await page.getByRole("button", { name: "+ Додати доказ" }).click();
    const visit = page.getByRole("group", { name: "Візит на місце" });
    const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString("en-CA", {
      timeZone: "Europe/Kyiv",
    });
    await visit.getByLabel("Дата візиту").fill(yesterday);
    await visit.getByLabel("Нотатка").fill("Оглянув вольєри, журнал прийому ведеться.");
    await page.getByRole("button", { name: "Додати", exact: true }).click();
    await expect(page.getByText("Докази додано.")).toBeVisible();

    dialog = await confirmAllow();
    await dialog.getByRole("button", { name: ALLOW }).click();
    await expect(page.getByText(/^До кінця показу: 60 днів$/)).toBeVisible();

    expect((await pub.goto(animalPath))?.status()).toBe(200);
    await expect(pub.getByText("На перевірці", { exact: true })).toBeVisible();
    await pub.goto(`/prytulky/${fixture.shelterId}`);
    await expect(pub.getByText("Притулок на перевірці")).toBeVisible();

    await page.getByRole("button", { name: "Зняти дозвіл" }).click();
    await expect(page.getByRole("button", { name: ALLOW })).toBeVisible();
    expect((await pub.goto(animalPath))?.status()).toBe(404);

    dialog = await confirmAllow();
    const submit = dialog.getByRole("button", { name: ALLOW });
    await expect(submit).toHaveAttribute("aria-disabled", "true");
    await dialog
      .getByLabel("Чому подовжуєте показ")
      .fill("Перевірка триває, чекаємо на відповідь.");
    await submit.click();
    await expect(page.getByRole("button", { name: "Зняти дозвіл" })).toBeVisible();
    expect((await pub.goto(animalPath))?.status()).toBe(200);
  } finally {
    await operator.close();
    await adopter.close();
    await server.stop();
  }
});
