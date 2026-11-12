/**
 * The kabinet animal card on a phone (owner's card spec, 2026-11-12): the tab order is name, status,
 * confirm, «Редагувати», ⋯ (spec rule 6); the status chip and the ⋯ keep a 48 px target and open their
 * menus; a very long name wraps inside the card, and no card overflows at 360 or 393. This replaces
 * the list row's corner-menu geometry, which the card no longer has. The action row's rule is the
 * owner's (2026-11-12, an owner-requested geometry exception): the primary left and «Редагувати» + ⋯
 * right on one line, or the primary alone at full width with the pair right-aligned below, never a
 * lone primary left short. Fictional verified shelter. Named zz-* to run last (see
 * fictional-shelter.ts). Own `x-forwarded-for` (.75).
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

const height = async (locator: Locator): Promise<number> => (await box(locator)).height;

/** The owner's action-row rule; returns whether the row wrapped. */
async function expectActionRow(card: Locator, primary: Locator, label: string): Promise<boolean> {
  const row = await box(primary.locator("xpath=.."));
  const first = await box(primary);
  const edit = await box(card.getByRole("link", { name: "Редагувати" }));
  const more = await box(card.getByRole("button", { name: /^Інші дії: / }));
  expect(first.x - row.x, `${label}: the primary at the left`).toBeLessThanOrEqual(1);
  expect(row.x + row.width - (more.x + more.width), `${label}: ⋯ at the right`).toBeLessThanOrEqual(
    1,
  );
  expect(Math.abs(edit.y - more.y), `${label}: «Редагувати» and ⋯ on one line`).toBeLessThan(4);
  const wrapped = Math.abs(first.y - edit.y) >= 4;
  if (wrapped) {
    expect(first.width, `${label}: alone, the primary fills its line`).toBeGreaterThanOrEqual(
      row.width - 1,
    );
    expect(edit.y, `${label}: the pair below it`).toBeGreaterThanOrEqual(first.y + first.height);
  } else {
    expect(first.x + first.width, `${label}: the primary before «Редагувати»`).toBeLessThan(edit.x);
  }
  return wrapped;
}

test("360 and 393 px: tab order name, status, confirm, «Редагувати», ⋯; 48 px targets; nothing overflows", async ({
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
  const draftName = "Чернетка";
  const reservedName = "Кармен";
  const db = createDatabase(HARNESS_DATABASE_URL);
  const stored = await shelterRepo(db).findById(fixture.shelterId);
  if (stored === null) throw new Error("the shelter isn't stored");
  const cityId = stored.publicLocation.cityId;
  const lately = new Date(Date.now() - 2 * 86_400_000);
  await animalRepo(db).insert(
    makeAnimal({
      shelterId: fixture.shelterId,
      name: longName,
      listing: { kind: "published", publishedAt: lately, confirmedAt: lately, undoable: null },
    }),
    cityId,
  );
  await animalRepo(db).insert(
    makeDraftAnimal({ shelterId: fixture.shelterId, name: draftName }),
    cityId,
  );
  await animalRepo(db).insert(
    makeAnimal({
      shelterId: fixture.shelterId,
      name: reservedName,
      listing: {
        kind: "reserved",
        since: lately,
        publishedAt: lately,
        confirmedAt: lately,
        undoable: null,
      },
    }),
    cityId,
  );
  const admin = await signedIn(browser, server, fixture.adminEmail, FORWARDED_FOR);
  try {
    const page = await admin.newPage();
    for (const width of [360, 393]) {
      await page.setViewportSize({ width, height: 852 });
      await page.goto("/kabinet/tvaryny");
      for (const name of [fixture.animalName, longName]) {
        const label = `${width}px ${name}`;
        const card = page
          .getByRole("listitem")
          .filter({ has: page.getByRole("heading", { name }) });
        await expect(card).toHaveCount(1);
        await card.scrollIntoViewIfNeeded();
        const link = card.getByRole("heading", { name }).getByRole("link");
        const status = card.getByRole("button", { name: /^Статус: / });
        const confirm = card.getByRole("button", { name: "Ще шукає" });
        const edit = card.getByRole("link", { name: "Редагувати" });
        const more = card.getByRole("button", { name: /^Інші дії: / });

        await link.focus();
        for (const next of [status, confirm, edit, more]) {
          await page.keyboard.press("Tab");
          await expect(next, label).toBeFocused();
        }
        for (const target of [status, confirm, more]) {
          expect(await height(target), `${label}: a 48px target`).toBeGreaterThanOrEqual(48);
        }
        expect(
          await card.evaluate((el) => el.scrollWidth <= el.clientWidth),
          `${label}: the card doesn't overflow`,
        ).toBe(true);
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `${width}px: no horizontal page scroll`,
      ).toBe(true);
    }

    // The action row at a phone width and two cards to a row at 1440, for every kind of primary.
    for (const width of [360, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/kabinet/tvaryny");
      for (const [name, primary] of [
        [fixture.animalName, "Ще шукає"],
        [reservedName, "Ще домовляються"],
        [draftName, "Опублікувати"],
      ] as const) {
        const card = page
          .getByRole("listitem")
          .filter({ has: page.getByRole("heading", { name }) });
        await card.scrollIntoViewIfNeeded();
        const wrapped = await expectActionRow(
          card,
          card.getByRole("button", { name: primary }),
          `${width}px ${name}`,
        );
        // The long label can't share a 360 px card's line: the wrapped branch is exercised.
        if (width === 360 && name === reservedName) expect(wrapped).toBe(true);
      }
    }

    // Both menus open and hold their entries.
    const card = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("heading", { name: longName }) });
    await card.getByRole("button", { name: /^Статус: / }).click();
    await expect(page.getByRole("button", { name: "Уже вдома…" })).toBeVisible();
    await page.keyboard.press("Escape");
    await card.getByRole("button", { name: /^Інші дії: / }).click();
    await expect(page.getByRole("button", { name: "Копіювати посилання" })).toBeVisible();
    await page.keyboard.press("Escape");
    const draft = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("heading", { name: draftName }) });
    await draft.getByRole("button", { name: /^Інші дії: / }).click();
    await expect(page.getByRole("button", { name: "Видалити чернетку" })).toBeVisible();
  } finally {
    await admin.close();
    await server.stop();
  }
});
