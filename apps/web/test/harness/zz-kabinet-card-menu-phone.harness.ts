/**
 * The kabinet animal card on a phone (owner's card spec, 2026-11-12): the tab order is name, status,
 * confirm, «Редагувати» or the pencil, ⋯ (spec rule 6); the status chip, the confirm and the ⋯ keep
 * a 48 px target and open what they open; a very long name wraps inside the card, and no card
 * overflows at 360 or 393. The action rows are the owner's (2026-11-13, an owner-requested geometry
 * exception, as #498's was): an aging or stale card's filled confirm, pencil and ⋯ stay on ONE line
 * at 320, 360 and 393 and in a 320 px card, for «Ще шукає» and «Ще домовляються» alike; a fresh
 * card's «Редагувати» fills a phone's row and sits right at its own width on a wider screen. A
 * draft keeps #498's row. Fictional verified shelter. Named zz-* to run last (see
 * fictional-shelter.ts). Own `x-forwarded-for` (.75).
 */

import { randomUUID } from "node:crypto";
import { createDatabase } from "@opika/db";
import { animalRepo, shelterRepo } from "@opika/db/repos";
import { makeAnimal, makeDraftAnimal } from "@opika/db/test";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { createFixture, HARNESS_DATABASE_URL, LOCATION_ENV, signedIn } from "./fictional-shelter";
import { startSignInServer } from "./sign-in-server";

const FORWARDED_FOR = "198.51.100.75";
test.use({ extraHTTPHeaders: { "x-forwarded-for": FORWARDED_FOR }, trace: "off" });

const DAY = 86_400_000;

type Box = { x: number; y: number; width: number; height: number };

async function box(locator: Locator): Promise<Box> {
  const found = await locator.boundingBox();
  if (found === null) throw new Error("element has no box");
  return found;
}

const height = async (locator: Locator): Promise<number> => (await box(locator)).height;

const cardOf = (page: Page, name: string) =>
  page.getByRole("listitem").filter({ has: page.getByRole("heading", { name }) });

const pencilOf = (card: Locator) => card.getByRole("link", { name: /^Редагувати картку: / });
const editOf = (card: Locator) => card.getByRole("link", { name: "Редагувати", exact: true });
const moreOf = (card: Locator) => card.getByRole("button", { name: /^Інші дії: / });

/**
 * Aging or stale: confirm, pencil, ⋯ in that order on one line, inside the card, the label unclipped
 * and on `lines` lines (two only for «Ще домовляються» at 320, the owner's choice of 2026-11-13).
 */
async function expectPromptRow(
  card: Locator,
  confirm: Locator,
  lines: 1 | 2,
  label: string,
): Promise<void> {
  const [own, first, pencil, more] = await Promise.all([
    box(card),
    box(confirm),
    box(pencilOf(card)),
    box(moreOf(card)),
  ]);
  expect(Math.abs(first.y - pencil.y), `${label}: confirm and pencil on one line`).toBeLessThan(4);
  expect(Math.abs(pencil.y - more.y), `${label}: pencil and ⋯ on one line`).toBeLessThan(4);
  expect(first.x + first.width, `${label}: the confirm before the pencil`).toBeLessThanOrEqual(
    pencil.x,
  );
  expect(pencil.x + pencil.width, `${label}: the pencil before ⋯`).toBeLessThanOrEqual(more.x);
  expect(more.x + more.width, `${label}: ⋯ inside the card`).toBeLessThanOrEqual(own.x + own.width);
  expect(first.height, `${label}: the confirm stays a 48 px pill`).toBeLessThan(49);
  expect(
    await confirm.evaluate((el) => el.scrollWidth <= el.clientWidth),
    `${label}: the confirm's label isn't clipped`,
  ).toBe(true);
  expect(
    await confirm
      .locator("span")
      .first()
      .evaluate((el) =>
        Math.round(
          el.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(el).lineHeight),
        ),
      ),
    `${label}: the label's lines`,
  ).toBe(lines);
}

/** Fresh: «Редагувати» and ⋯ on one line, ⋯ at the right; «Редагувати» fills a phone's row only. */
async function expectFreshRow(card: Locator, phone: boolean, label: string): Promise<void> {
  const edit = editOf(card);
  const [row, own, more] = await Promise.all([
    box(edit.locator("xpath=..")),
    box(edit),
    box(moreOf(card)),
  ]);
  expect(Math.abs(own.y - more.y), `${label}: «Редагувати» and ⋯ on one line`).toBeLessThan(4);
  expect(row.x + row.width - (more.x + more.width), `${label}: ⋯ at the right`).toBeLessThanOrEqual(
    1,
  );
  if (phone) {
    expect(own.x - row.x, `${label}: «Редагувати» fills the row`).toBeLessThanOrEqual(1);
  } else {
    expect(own.x - row.x, `${label}: «Редагувати» at its own width, right`).toBeGreaterThan(48);
  }
}

/**
 * Fresh: below desktop the freshness line is a full row under the photo (owner, 2026-11-13), beside it
 * from desktop; the link's words stay on one line with the ✓ and never run into the freshness words.
 */
async function expectFreshLine(
  card: Locator,
  link: Locator,
  belowPhoto: boolean,
  label: string,
): Promise<void> {
  const [photo, pips, words, lineHeight] = await Promise.all([
    box(card.locator("a[aria-hidden='true']").first()),
    box(card.locator("[data-fill]")),
    box(card.getByText(/^Оновлено /)),
    link.evaluate((el) => Number.parseFloat(getComputedStyle(el).lineHeight)),
  ]);
  if (belowPhoto) {
    expect(pips.y, `${label}: the freshness line under the photo`).toBeGreaterThanOrEqual(
      photo.y + photo.height,
    );
    expect(Math.abs(pips.x - photo.x), `${label}: from the photo's left edge`).toBeLessThan(2);
  } else {
    expect(pips.x, `${label}: the freshness line beside the photo`).toBeGreaterThan(
      photo.x + photo.width,
    );
  }
  const text = await link.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const { x, y, width, height } = range.getBoundingClientRect();
    return { x, y, width, height };
  });
  expect(text.height, `${label}: the link and its ✓ on one line`).toBeLessThan(lineHeight * 1.5);
  const below = text.y >= words.y + words.height - 1;
  const beside = text.x >= words.x + words.width - 1;
  expect(below || beside, `${label}: the link clear of the freshness words`).toBe(true);
}

/** #498's draft row: «Опублікувати» left, «Редагувати» + ⋯ right, or alone at full width with the pair below. */
async function expectDraftRow(card: Locator, primary: Locator, label: string): Promise<void> {
  const row = await box(primary.locator("xpath=.."));
  const first = await box(primary);
  const edit = await box(editOf(card));
  const more = await box(moreOf(card));
  expect(first.x - row.x, `${label}: the primary at the left`).toBeLessThanOrEqual(1);
  expect(row.x + row.width - (more.x + more.width), `${label}: ⋯ at the right`).toBeLessThanOrEqual(
    1,
  );
  expect(Math.abs(edit.y - more.y), `${label}: «Редагувати» and ⋯ on one line`).toBeLessThan(4);
  if (Math.abs(first.y - edit.y) >= 4) {
    expect(first.width, `${label}: alone, the primary fills its line`).toBeGreaterThanOrEqual(
      row.width - 1,
    );
    expect(edit.y, `${label}: the pair below it`).toBeGreaterThanOrEqual(first.y + first.height);
  } else {
    expect(first.x + first.width, `${label}: the primary before «Редагувати»`).toBeLessThan(edit.x);
  }
}

test("320 to 393 px and a 320 px card: tab order, 48 px targets, one-line action rows, nothing overflows", async ({
  browser,
}) => {
  test.setTimeout(240_000);
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
  const agingName = "Деймос";
  const staleReservedName = "Білка";
  const db = createDatabase(HARNESS_DATABASE_URL);
  const stored = await shelterRepo(db).findById(fixture.shelterId);
  if (stored === null) throw new Error("the shelter isn't stored");
  const cityId = stored.publicLocation.cityId;
  const daysAgo = (days: number) => new Date(Date.now() - days * DAY);
  const lately = daysAgo(2);
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
  for (const [name, confirmedAt] of [
    [reservedName, lately],
    [staleReservedName, daysAgo(40)],
  ] as const) {
    await animalRepo(db).insert(
      makeAnimal({
        shelterId: fixture.shelterId,
        name,
        listing: {
          kind: "reserved",
          since: daysAgo(41),
          publishedAt: daysAgo(41),
          confirmedAt,
          undoable: null,
        },
      }),
      cityId,
    );
  }
  await animalRepo(db).insert(
    makeAnimal({
      shelterId: fixture.shelterId,
      name: agingName,
      listing: {
        kind: "published",
        publishedAt: daysAgo(12),
        confirmedAt: daysAgo(12),
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
      for (const name of [fixture.animalName, longName, agingName]) {
        const label = `${width}px ${name}`;
        const card = cardOf(page, name);
        await expect(card).toHaveCount(1);
        await card.scrollIntoViewIfNeeded();
        const link = card.getByRole("heading", { name }).getByRole("link");
        const status = card.getByRole("button", { name: /^Статус: / });
        const confirm = card.getByRole("button", { name: "Ще шукає" });
        // Only the long name is fresh: the fixture's animal dates from 2026-08-01, so it is stale.
        const edit = name === longName ? editOf(card) : pencilOf(card);
        const more = moreOf(card);

        await link.focus();
        for (const next of [status, confirm, edit, more]) {
          await page.keyboard.press("Tab");
          await expect(next, label).toBeFocused();
        }
        for (const target of [status, confirm, edit, more]) {
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

    // The action rows at every phone width, at 1440, and in a card at the grid's 320 px minimum.
    for (const width of [320, 360, 393, 1440, "320px card"] as const) {
      await page.setViewportSize({ width: typeof width === "number" ? width : 1440, height: 900 });
      await page.goto("/kabinet/tvaryny");
      if (width === "320px card") {
        await page
          .getByRole("tabpanel")
          .getByRole("list")
          .first()
          .evaluate((list) => {
            (list as HTMLElement).style.gridTemplateColumns = "repeat(auto-fill, 320px)";
          });
        expect((await box(cardOf(page, agingName))).width).toBe(320);
      }
      const phone = typeof width === "number" && width < 600;
      for (const [name, primary] of [
        [agingName, "Ще шукає"],
        [fixture.animalName, "Ще шукає"],
        [staleReservedName, "Ще домовляються"],
      ] as const) {
        const card = cardOf(page, name);
        await card.scrollIntoViewIfNeeded();
        await expectPromptRow(
          card,
          card.getByRole("button", { name: primary }),
          width === 320 && primary === "Ще домовляються" ? 2 : 1,
          `${width} ${name}`,
        );
      }
      for (const [name, link] of [
        [longName, "Ще шукає"],
        [reservedName, "Ще домовляються"],
      ] as const) {
        const card = cardOf(page, name);
        await card.scrollIntoViewIfNeeded();
        await expectFreshRow(card, phone, `${width} ${name}`);
        await expectFreshLine(
          card,
          card.getByRole("button", { name: link }),
          phone,
          `${width} ${name}`,
        );
      }
      const draft = cardOf(page, draftName);
      await draft.scrollIntoViewIfNeeded();
      await expectDraftRow(draft, draft.getByRole("button", { name: "Опублікувати" }), `${width}`);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `${width}: no horizontal page scroll`,
      ).toBe(true);
    }

    // Both menus open and hold their entries.
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto("/kabinet/tvaryny");
    const card = cardOf(page, longName);
    await card.getByRole("button", { name: /^Статус: / }).click();
    await expect(page.getByRole("button", { name: "Уже вдома…" })).toBeVisible();
    await page.keyboard.press("Escape");
    await moreOf(card).click();
    await expect(page.getByRole("button", { name: "Копіювати посилання" })).toBeVisible();
    await page.keyboard.press("Escape");
    await moreOf(cardOf(page, draftName)).click();
    await expect(page.getByRole("button", { name: "Видалити чернетку" })).toBeVisible();
  } finally {
    await admin.close();
    await server.stop();
  }
});
