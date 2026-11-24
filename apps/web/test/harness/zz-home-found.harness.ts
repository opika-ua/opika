/**
 * «Уже вдома» (owner, 2026-11-24): an animal adopted under 90 days ago keeps a calm page, noindex,
 * follow; past 90 days it is the same 404 as any gone card. Neither is in the gallery or the
 * sitemap. Fictional shelter in the harness database; own `x-forwarded-for` (TEST-NET-2 .140).
 */

import { createDatabase } from "@opika/db";
import { animalRepo } from "@opika/db/repos";
import { animals, cities } from "@opika/db/schema";
import { makeAnimal } from "@opika/db/test";
import type { AnimalPhoto, ShelterId } from "@opika/domain";
import { expect, type Page, test } from "@playwright/test";
import { createFixture, HARNESS_DATABASE_URL } from "./fictional-shelter";

test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.140" } });

const DAY = 86_400_000;

async function galleryCount(page: Page): Promise<number> {
  await page.goto("/tvaryny");
  const text = await page
    .getByText(/Знайдено \d+/)
    .first()
    .innerText();
  return Number(text.match(/Знайдено (\d+)/)?.[1]);
}

/** Two adopted cards under the fixture's shelter, with a seeded animal's photos: 10 and 91 days ago. */
async function insertAdopted(shelterId: ShelterId) {
  const db = createDatabase(HARNESS_DATABASE_URL);
  const [city] = await db.select({ id: cities.id }).from(cities).limit(1);
  const seeded = await db.select({ photos: animals.photos }).from(animals);
  const withPhotos = seeded.find((row) => row.photos.length > 0);
  if (city === undefined || withPhotos === undefined) throw new Error("no seeded city or photo");
  const now = Date.now();
  const make = (name: string, daysAgo: number) =>
    makeAnimal({
      shelterId,
      name,
      species: "dog",
      photos: withPhotos.photos as readonly AnimalPhoto[],
      listing: { kind: "adopted", adoptedAt: new Date(now - daysAgo * DAY) },
      everServedAt: new Date(now - (daysAgo + 30) * DAY),
    });
  const recent = make("Бурштин", 10);
  const old = make("Вересень", 91);
  for (const animal of [recent, old]) await animalRepo(db).insert(animal, city.id as never);
  return { recent, old };
}

test("an adoption under 90 days shows «Уже вдома»; past 90 days it is the 404; neither is listed", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const fixture = await createFixture("home-found", (operatorId, now) => ({
    status: "verified",
    verifiedAt: now,
    verifiedBy: operatorId,
    evidence: { items: [], submittedAt: now },
  }));
  const listed = await galleryCount(page);
  const { recent, old } = await insertAdopted(fixture.shelterId);
  expect(await galleryCount(page)).toBe(listed);

  const response = await page.goto(`/tvaryny/${recent.id}`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Бурштин уже вдома" })).toBeVisible();
  await expect(
    page.getByText("Ця тварина вже знайшла родину. Інші ще чекають на свій дім."),
  ).toBeVisible();
  await expect(page.getByRole("img", { name: "Бурштин" })).toBeVisible();
  await expect(page.getByTestId("home-found-action")).toHaveAttribute("href", "/tvaryny");
  await expect(page).toHaveTitle("Бурштин уже вдома – Opika");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, follow");
  await expect(page.getByTestId("reveal-trigger")).toHaveCount(0);
  await expect(page.getByText(fixture.shelterId)).toHaveCount(0);

  const gone = await page.goto(`/tvaryny/${old.id}`);
  expect(gone?.status()).toBe(404);
  await expect(page.getByText("Цієї картки більше немає.")).toBeVisible();

  const sitemap = await (await page.request.get("/sitemap.xml")).text();
  expect(sitemap).toContain(`/tvaryny/${fixture.animalId}`);
  expect(sitemap).not.toContain(recent.id);
  expect(sitemap).not.toContain(old.id);
});
