/**
 * Owner-requested geometry exception to "test logic, not looks": on a 393 px phone the «На
 * перевірці» and reserved badges lie on the photo and never cover the freshness line (the
 * under-review badge used to anchor to the card's bottom). Fictional early-listed shelter made
 * through the real operator action; a reserved animal is added next to it. Named zz-* to run last
 * (see fictional-shelter.ts). Own `x-forwarded-for` (.74).
 */

import { randomUUID } from "node:crypto";
import { createDatabase } from "@opika/db";
import { animalRepo } from "@opika/db/repos";
import { cities } from "@opika/db/schema";
import { makeAnimal } from "@opika/db/test";
import type { ShelterId } from "@opika/domain";
import { expect, type Locator, test } from "@playwright/test";
import {
  adopterContext,
  createFixture,
  HARNESS_DATABASE_URL,
  LOCATION_ENV,
  signedIn,
} from "./fictional-shelter";
import { fillDateField } from "./harness";
import { startSignInServer } from "./sign-in-server";

const FORWARDED_FOR = "198.51.100.74";
test.use({ extraHTTPHeaders: { "x-forwarded-for": FORWARDED_FOR }, trace: "off" });

const ALLOW = "Дозволити показ до завершення перевірки";

type Box = { x: number; y: number; width: number; height: number };

async function box(locator: Locator): Promise<Box> {
  const found = await locator.boundingBox();
  if (found === null) throw new Error("element has no box");
  return found;
}

const inside = (inner: Box, outer: Box) =>
  inner.x >= outer.x - 0.5 &&
  inner.y >= outer.y - 0.5 &&
  inner.x + inner.width <= outer.x + outer.width + 0.5 &&
  inner.y + inner.height <= outer.y + outer.height + 0.5;

const intersects = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test("393 px: the under-review and reserved badges sit on the photo, clear of the freshness line", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const server = await startSignInServer(HARNESS_DATABASE_URL, LOCATION_ENV);
  const fixture = await createFixture("badges", (_operatorId, now) => ({
    status: "pending",
    submittedAt: now,
    evidence: { submittedAt: now, items: [] },
  }));
  const operator = await signedIn(browser, server, fixture.operatorEmail, FORWARDED_FOR);
  const adopter = await adopterContext(browser, server, FORWARDED_FOR);
  try {
    const page = await operator.newPage();
    await page.goto(`/kabinet/prytulky/${fixture.shelterId}`);
    await page.getByLabel("Тип доказу").selectOption({ label: "Відеодзвінок" });
    await page.getByRole("button", { name: "+ Додати доказ" }).click();
    const visit = page.getByRole("group", { name: "Відеодзвінок" });
    const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString("en-CA", {
      timeZone: "Europe/Kyiv",
    });
    await fillDateField(visit, "Дата дзвінка", yesterday);
    await visit.getByLabel("Нотатка").fill("Оглянув вольєри, журнал прийому ведеться.");
    await page.getByRole("button", { name: "Додати", exact: true }).click();
    await expect(page.getByText("Докази додано.")).toBeVisible();
    await page.getByRole("button", { name: ALLOW }).click();
    await page.getByRole("dialog", { name: ALLOW }).getByRole("button", { name: ALLOW }).click();
    await expect(page.getByText(/^До кінця показу: 60 днів$/)).toBeVisible();

    // A reserved animal in the same early-listed shelter (the repository insert, as the other
    // specs do for listing states the UI reaches only through a longer path).
    const db = createDatabase(HARNESS_DATABASE_URL);
    const [city] = await db.select({ id: cities.id }).from(cities).limit(1);
    if (city === undefined) throw new Error("no seeded city");
    const reservedName = `Резерв${randomUUID().slice(0, 4)}`;
    const lately = new Date(Date.now() - 2 * 86_400_000);
    await animalRepo(db).insert(
      makeAnimal({
        shelterId: fixture.shelterId as ShelterId,
        name: reservedName,
        listing: {
          kind: "reserved",
          since: lately,
          publishedAt: lately,
          confirmedAt: lately,
          undoable: null,
        },
      }),
      city.id as never,
    );

    const pub = await adopter.newPage();
    await pub.setViewportSize({ width: 393, height: 852 });

    for (const [name, badgeIds] of [
      [fixture.animalName, ["under-review-badge"]],
      [reservedName, ["reserved-badge", "under-review-badge"]],
    ] as const) {
      // The seeded animals fill the first pages: walk the pages until the card shows up.
      const card = pub.getByTestId("animal-card").filter({ hasText: name });
      for (let n = 1; n <= 15; n++) {
        await pub.goto(n === 1 ? "/tvaryny" : `/tvaryny?stor=${n}`, { waitUntil: "load" });
        if ((await card.count()) > 0) break;
      }
      await expect(card).toHaveCount(1);
      await card.scrollIntoViewIfNeeded();
      const photo = await box(card.locator(":scope > div").first());
      const fresh = await box(card.getByTestId("freshness-badge"));
      const boxes: Box[] = [];
      for (const id of badgeIds) {
        const badge = await box(card.getByTestId(id).locator("> *").first());
        expect(inside(badge, photo), `${name} ${id} inside the photo`).toBe(true);
        expect(intersects(badge, fresh), `${name} ${id} clear of freshness`).toBe(false);
        boxes.push(badge);
      }
      if (boxes.length === 2) {
        const [first, second] = boxes as [Box, Box];
        expect(intersects(first, second), `${name} badges clear of each other`).toBe(false);
      }
    }
  } finally {
    await operator.close();
    await adopter.close();
    await server.stop();
  }
});
