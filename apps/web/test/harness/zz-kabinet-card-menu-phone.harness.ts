/**
 * Owner-requested geometry exception to "test logic, not looks": on a 393 px phone the kabinet
 * animal card's «⋯» menu sits in the card's top-right corner, level with the name, and the single
 * full-width confirm button stays at the bottom. Tab order is name, menu, confirm; a very long
 * name is cut off instead of pushing the menu out of the card. A second test pins that the photo
 * ends level with the status line (no empty space under it). Fictional verified shelter. Named zz-*
 * to run last (see fictional-shelter.ts). Own `x-forwarded-for` (.75).
 */

import { randomUUID } from "node:crypto";
import { createDatabase } from "@opika/db";
import { animalRepo, shelterRepo } from "@opika/db/repos";
import { makeAnimal, makeDraftAnimal } from "@opika/db/test";
import { expect, type Locator, test } from "@playwright/test";
import { createFixture, HARNESS_DATABASE_URL, LOCATION_ENV, signedIn } from "./fictional-shelter";
import { startSignInServer } from "./sign-in-server";

const FORWARDED_FOR = "198.51.100.75";
test.use({ extraHTTPHeaders: { "x-forwarded-for": FORWARDED_FOR }, trace: "off" });

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

test("393 px: the card menu is in the top-right corner, clear of the confirm button and the tab order is name, menu, confirm", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const server = await startSignInServer(HARNESS_DATABASE_URL, LOCATION_ENV);
  const fixture = await createFixture("cardmenu", (operatorId, now) => ({
    status: "verified",
    verifiedAt: now,
    verifiedBy: operatorId,
    evidence: { items: [], submittedAt: now },
  }));
  const longName = `Дуже${"довге".repeat(12)}ІмʼяТварини${randomUUID().slice(0, 4)}`;
  const db = createDatabase(HARNESS_DATABASE_URL);
  const stored = await shelterRepo(db).findById(fixture.shelterId);
  if (stored === null) throw new Error("the shelter isn't stored");
  const lately = new Date(Date.now() - 2 * 86_400_000);
  await animalRepo(db).insert(
    makeAnimal({
      shelterId: fixture.shelterId,
      name: longName,
      listing: { kind: "published", publishedAt: lately, confirmedAt: lately, undoable: null },
    }),
    stored.publicLocation.cityId,
  );
  const admin = await signedIn(browser, server, fixture.adminEmail, FORWARDED_FOR);
  try {
    const page = await admin.newPage();
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto("/kabinet/tvaryny");

    for (const name of [fixture.animalName, longName]) {
      const card = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name }) });
      await expect(card).toHaveCount(1);
      await card.scrollIntoViewIfNeeded();
      const menu = card.getByRole("button", { name: /^Дії з карткою/ }).first();
      const confirm = card.getByRole("button", { name: /^✓|Ще шукає/ }).first();
      const link = card.getByRole("heading", { name }).getByRole("link");
      await expect(menu).toBeVisible();
      const panel = await box(card);
      const menuBox = await box(menu);
      const confirmBox = await box(confirm);
      const linkBox = await box(link);

      expect(inside(menuBox, panel), `${name}: menu inside the card`).toBe(true);
      expect(intersects(menuBox, confirmBox), `${name}: menu clear of confirm`).toBe(false);
      expect(menuBox.y + menuBox.height, `${name}: menu above confirm`).toBeLessThanOrEqual(
        confirmBox.y,
      );
      expect(menuBox.y - panel.y, `${name}: menu in the top band`).toBeLessThan(80);
      expect(
        panel.x + panel.width - (menuBox.x + menuBox.width),
        `${name}: at the right`,
      ).toBeLessThan(32);
      expect(intersects(menuBox, linkBox), `${name}: menu clear of the name`).toBe(false);
      expect(inside(linkBox, panel), `${name}: name inside the card`).toBe(true);
      expect(confirmBox.width, `${name}: confirm is full width`).toBeGreaterThan(panel.width * 0.7);

      // Tab order: name, menu, confirm.
      await link.focus();
      await page.keyboard.press("Tab");
      await expect(menu).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(confirm).toBeFocused();
    }

    // The menu still opens and carries its entries.
    const card = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("heading", { name: longName }) });
    await card
      .getByRole("button", { name: /^Дії з карткою/ })
      .first()
      .click();
    await expect(page.getByRole("link", { name: "Редагувати" })).toBeVisible();
  } finally {
    await admin.close();
    await server.stop();
  }
});

test("360 and 393 px: the photo ends level with the status line, the menu stays tappable, nothing overflows", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const server = await startSignInServer(HARNESS_DATABASE_URL, LOCATION_ENV);
  const fixture = await createFixture("cardphoto", (operatorId, now) => ({
    status: "verified",
    verifiedAt: now,
    verifiedBy: operatorId,
    evidence: { items: [], submittedAt: now },
  }));
  const longName = "Бровко Довгоіменний!";
  const draftName = "Чернетка";
  const db = createDatabase(HARNESS_DATABASE_URL);
  const stored = await shelterRepo(db).findById(fixture.shelterId);
  if (stored === null) throw new Error("the shelter isn't stored");
  const cityId = stored.publicLocation.cityId;
  const lately = new Date(Date.now() - 86_400_000);
  await animalRepo(db).insert(
    makeAnimal({
      shelterId: fixture.shelterId,
      name: longName,
      listing: { kind: "published", publishedAt: lately, confirmedAt: lately, undoable: null },
    }),
    cityId,
  );
  // A draft's status line is a two-line sentence: the text block is taller than the photo's minimum.
  await animalRepo(db).insert(
    makeDraftAnimal({ shelterId: fixture.shelterId, name: draftName }),
    cityId,
  );
  const admin = await signedIn(browser, server, fixture.adminEmail, FORWARDED_FOR);
  try {
    const page = await admin.newPage();
    for (const width of [360, 393]) {
      await page.setViewportSize({ width, height: 852 });
      await page.goto("/kabinet/tvaryny");
      for (const name of [fixture.animalName, longName, draftName]) {
        const card = page
          .getByRole("listitem")
          .filter({ has: page.getByRole("heading", { name }) });
        await card.scrollIntoViewIfNeeded();
        const draft = name === draftName;
        const photo = await box(card.locator("a[aria-hidden='true'] > div"));
        const status = await box(card.getByText(draft ? /^Ті, хто/ : /^Оновлено/));
        const menuButton = card.getByRole("button", { name: /^Дії з карткою/ }).first();
        const menu = await box(menuButton);
        const button = await box(
          card.getByRole("button", { name: /^✓|Ще шукає|Опублікувати/ }).first(),
        );
        const panel = await box(card);
        const label = `${width}px ${name}`;
        if (name !== longName) {
          expect(
            Math.abs(photo.y + photo.height - (status.y + status.height)),
            `${label}: photo ends level with the status line`,
          ).toBeLessThanOrEqual(8);
        }
        expect(button.height, `${label}: button is a full target`).toBeGreaterThanOrEqual(44);
        expect(inside(button, panel), `${label}: button inside the card`).toBe(true);
        expect(inside(menu, panel), `${label}: menu inside the card`).toBe(true);
        expect(menu.height, `${label}: menu keeps its target size`).toBeGreaterThanOrEqual(48);
        // The name link must not cover the menu's hit area.
        const hit = await page.evaluate(
          ([x, y]) =>
            document.elementFromPoint(x, y)?.closest("button")?.getAttribute("aria-label"),
          [menu.x + menu.width / 2, menu.y + menu.height / 2] as const,
        );
        expect(hit, `${label}: the menu's centre hits the menu`).toMatch(/^Дії з карткою/);
        expect(
          await card.evaluate((el) => el.scrollWidth <= el.clientWidth),
          `${label}: the card doesn't overflow`,
        ).toBe(true);
        if (width === 393 && name === fixture.animalName) {
          const meta = await box(card.getByText(/^Кіт|^Собака/).first());
          const title = await box(card.getByRole("heading", { name }).locator("span"));
          console.log(
            `name-to-meta at 393: gap ${(meta.y - (title.y + title.height)).toFixed(1)}px, centres ${(meta.y + meta.height / 2 - (title.y + title.height / 2)).toFixed(1)}px`,
          );
        }
      }
    }
  } finally {
    await admin.close();
    await server.stop();
  }
});
