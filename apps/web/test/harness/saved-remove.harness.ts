/**
 * The saved page's remove bookmark in a real browser at 320, 393 and 1440: no sideways scroll, no
 * layout shift while the page loads, a press area of at least 44px that stays clear of the
 * freshness chip, and the remove, undo and empty-state flow found by role and label.
 *
 * Its own client address (TEST-NET-2, .85): the gallery and the saved batch read are rate-limited
 * per IP, and three viewports each load the gallery once and the saved page once or twice.
 */

import { expect, type Page, test } from "@playwright/test";
import { noSidewaysScroll, openRoute } from "./harness";
import type { Viewport } from "./viewports";

test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.85" } });

const CARD = "[data-testid='animal-card']";
const REMOVE = "Прибрати зі збережених";
const VIEWPORTS: readonly Viewport[] = [
  { name: "320x640 narrow phone", width: 320, height: 640 },
  { name: "393x852 phone", width: 393, height: 852 },
  { name: "1440x900 desktop", width: 1440, height: 900 },
];

/** Three real animal ids from the gallery, saved the way the app saves them (`likes.v1`). */
async function saveThreeFromGallery(page: Page, viewport: Viewport): Promise<void> {
  await openRoute(page, "/tvaryny", viewport, { readySelector: CARD });
  const ids = await page.locator(CARD).evaluateAll((cards) =>
    cards
      .map((card) => card.getAttribute("href")?.match(/\/tvaryny\/([0-9a-f-]{36})/)?.[1])
      .filter((id): id is string => id !== undefined)
      .slice(0, 3),
  );
  expect(ids.length, "the seeded gallery has at least three animals").toBe(3);
  await page.addInitScript((saved) => {
    if (window.localStorage.getItem("likes.v1") !== null) return;
    const items = saved.map((animalId, at) => ({
      animalId,
      likedAt: new Date(Date.UTC(2026, 9, 20 + at)).toISOString(),
    }));
    window.localStorage.setItem("likes.v1", JSON.stringify({ version: 1, items }));
  }, ids);
}

/** Layout shift of the page load, as the browser scores it (`layout-shift` entries not caused by input). */
async function watchLayoutShift(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: number };
    w.__cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as unknown as { value: number; hadRecentInput: boolean };
        if (!shift.hadRecentInput) w.__cls += shift.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
}

for (const viewport of VIEWPORTS) {
  test.describe(`/zberezheni remove bookmark at ${viewport.name}`, () => {
    test("loads without sideways scroll or layout shift; the bookmark is a 44px target clear of the freshness chip", async ({
      page,
    }) => {
      await saveThreeFromGallery(page, viewport);
      await watchLayoutShift(page);
      await page.goto("/zberezheni", { waitUntil: "load" });
      const bookmarks = page.getByRole("button", { name: REMOVE });
      await expect(bookmarks).toHaveCount(3);
      await page.waitForTimeout(400);

      expect(await noSidewaysScroll(page), "the page scrolls sideways").toBe(true);
      const shift = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
      expect(shift, "layout shift while /zberezheni loads").toBeLessThan(0.1);

      const chips = page.getByTestId("freshness-badge");
      for (let at = 0; at < 3; at++) {
        const box = await bookmarks.nth(at).boundingBox();
        expect(box, "the bookmark has a box").not.toBeNull();
        expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
        const chip = await chips.nth(at).boundingBox();
        // Beside the photo's corner on a tablet or wider; a phone puts the freshness under the photo.
        if (chip !== null && box !== null) {
          const apart =
            chip.x + chip.width <= box.x ||
            box.x + box.width <= chip.x ||
            chip.y + chip.height <= box.y ||
            box.y + box.height <= chip.y;
          expect(apart, `the freshness chip of card ${at + 1} overlaps its bookmark`).toBe(true);
        }
      }
    });

    test("remove, undo in the same place, then remove all: the empty state, with the toast and focus kept", async ({
      page,
    }) => {
      await saveThreeFromGallery(page, viewport);
      await page.goto("/zberezheni", { waitUntil: "load" });
      const names = page.getByTestId("card-name");
      await expect(names).toHaveCount(3);
      const before = await names.allTextContents();
      const bookmarks = page.getByRole("button", { name: REMOVE });

      await bookmarks.nth(1).click();
      await expect(page.getByText("Прибрано зі збережених", { exact: true })).toBeVisible();
      await expect(names).toHaveCount(2);
      await expect(page.getByTestId("nav-saved")).toHaveAttribute("aria-label", "Збережені, 2");

      await page.getByRole("button", { name: "Повернути" }).click();
      await expect(names).toHaveCount(3);
      expect(await names.allTextContents()).toEqual(before);

      for (let left = 3; left > 0; left--) {
        await bookmarks.first().click();
        await expect(names).toHaveCount(left - 1);
      }
      await expect(page.getByTestId("saved-empty")).toBeVisible();
      await expect(page.getByRole("button", { name: "Повернути" }).first()).toBeVisible();
      await expect(page.getByText(/Тут поки нічого немає/)).toBeFocused();
    });
  });
}
