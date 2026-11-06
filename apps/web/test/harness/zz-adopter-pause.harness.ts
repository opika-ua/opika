/**
 * A shelter pauses and resumes taking requests, as an adopter sees it: the notice on the animal and
 * shelter pages, no reveal button, the animal gone from the gallery count; and back after resume.
 * Fictional shelter and admin in the harness database, the pause done through the cabinet.
 * Own `x-forwarded-for` (TEST-NET-2 .71).
 */

import { expect, test } from "@playwright/test";
import {
  adopterContext,
  createFixture,
  type Fixture,
  HARNESS_DATABASE_URL,
  LOCATION_ENV,
  signedIn,
} from "./fictional-shelter";
import { type SignInServer, startSignInServer } from "./sign-in-server";

const FORWARDED_FOR = "198.51.100.71";
test.use({ extraHTTPHeaders: { "x-forwarded-for": FORWARDED_FOR }, trace: "off" });

const NOTICE = "Притулок тимчасово не приймає нових звернень";

test("pause and resume, seen by an adopter", async ({ browser }) => {
  test.setTimeout(180_000);
  const server: SignInServer = await startSignInServer(HARNESS_DATABASE_URL, LOCATION_ENV);
  const fixture: Fixture = await createFixture("pause", (operatorId, now) => ({
    status: "verified",
    verifiedAt: now,
    verifiedBy: operatorId,
    evidence: { items: [], submittedAt: now },
  }));
  const admin = await signedIn(browser, server, fixture.adminEmail, FORWARDED_FOR);
  const adopter = await adopterContext(browser, server, FORWARDED_FOR);
  try {
    const animalPath = `/tvaryny/${fixture.animalId}`;
    const page = await adopter.newPage();
    const galleryCount = async () => {
      await page.goto("/tvaryny");
      const text = await page
        .getByText(/Знайдено \d+/)
        .first()
        .innerText();
      return Number(text.match(/Знайдено (\d+)/)?.[1]);
    };

    await page.goto(animalPath);
    await expect(page.getByRole("heading", { name: fixture.animalName })).toBeVisible();
    await expect(page.getByTestId("reveal-trigger")).toBeVisible();
    const listed = await galleryCount();

    const cabinet = await admin.newPage();
    await cabinet.goto("/kabinet/prytulok");
    await cabinet.getByRole("button", { name: "Призупинити прийом звернень" }).click();
    const dialog = cabinet.getByRole("dialog", { name: "Призупинити прийом звернень?" });
    await dialog.getByLabel("Причина").selectOption({ label: "Сезонна перерва" });
    await dialog.getByRole("button", { name: "Призупинити прийом звернень" }).click();
    await expect(cabinet.getByText("Прийом звернень на паузі.", { exact: true })).toBeVisible();

    await page.goto(animalPath);
    await expect(page.getByText(NOTICE)).toBeVisible();
    await expect(page.getByText("Причина: Сезонна перерва")).toBeVisible();
    await expect(page.getByTestId("reveal-trigger")).toHaveCount(0);
    await page.goto(`/prytulky/${fixture.shelterId}`);
    await expect(page.getByText(NOTICE)).toBeVisible();
    await expect(
      page.getByText("Тварини з цього притулку зараз не показуються в галереї."),
    ).toBeVisible();
    await expect(page.getByTestId("animal-card")).toHaveCount(0);
    expect(await galleryCount()).toBe(listed - 1);

    await cabinet.getByRole("button", { name: "Відновити прийом звернень" }).click();
    await expect(cabinet.getByText(/^Прийом звернень відновлено/)).toBeVisible();
    await page.goto(animalPath);
    await expect(page.getByText(NOTICE)).toHaveCount(0);
    await expect(page.getByTestId("reveal-trigger")).toBeVisible();
    expect(await galleryCount()).toBe(listed);
  } finally {
    await admin.close();
    await adopter.close();
    await server.stop();
  }
});
