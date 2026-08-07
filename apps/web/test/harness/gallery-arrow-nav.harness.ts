/**
 * E2.5 (issue #28): `docs/design/README.md`'s "Keyboard" table — arrow keys
 * move focus by the grid's actual column count, Home/End jump to first/
 * last, edges never wrap. A real keyboard, not markup inspection: every
 * assertion here reads `document.activeElement` after a real
 * `page.keyboard.press()`, the same standard `docs/standing-constraints.md`
 * holds every other interaction in this harness to.
 */

import { expect, test } from "@playwright/test";
import { openRoute } from "./harness";
import { DESKTOP, PHONE } from "./viewports";

const ROUTE = "/tvaryny";
const CARD = "[data-testid='animal-card']";

async function focusedIndex(page: { evaluate: <T>(fn: () => T) => Promise<T> }): Promise<number> {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll("[data-testid='animal-card']"));
    return document.activeElement ? cards.indexOf(document.activeElement) : -1;
  });
}

async function tabIndexOf(
  page: { evaluate: <T>(fn: (i: number) => T, arg: number) => Promise<T> },
  index: number,
): Promise<number | undefined> {
  return page.evaluate((i) => {
    const cards = Array.from(document.querySelectorAll("[data-testid='animal-card']"));
    return (cards[i] as HTMLElement | undefined)?.tabIndex;
  }, index);
}

test.describe("/tvaryny arrow-key grid navigation (desktop, 3 columns)", () => {
  test("ArrowRight/ArrowDown/ArrowLeft/ArrowUp move focus by the real column count", async ({
    page,
  }) => {
    await openRoute(page, ROUTE, DESKTOP, { readySelector: CARD });
    await page.locator(CARD).first().focus();
    expect(await focusedIndex(page), "starts focused on the first card").toBe(0);

    await page.keyboard.press("ArrowRight");
    expect(await focusedIndex(page), "ArrowRight moves to the next card in the row").toBe(1);

    await page.keyboard.press("ArrowDown");
    expect(await focusedIndex(page), "ArrowDown moves by the column count (3)").toBe(4);

    await page.keyboard.press("ArrowLeft");
    expect(await focusedIndex(page), "ArrowLeft moves back one").toBe(3);

    await page.keyboard.press("ArrowUp");
    expect(await focusedIndex(page), "ArrowUp moves back up by the column count").toBe(0);
  });

  test("edges do not wrap — the rightmost card in a row stays put on ArrowRight", async ({
    page,
  }) => {
    await openRoute(page, ROUTE, DESKTOP, { readySelector: CARD });
    // Card index 2 is the rightmost of the first 3-column row.
    await page.evaluate(() => {
      const card = document.querySelectorAll("[data-testid='animal-card']")[2] as HTMLElement;
      card.tabIndex = 0;
      card.focus();
    });
    expect(await focusedIndex(page)).toBe(2);

    await page.keyboard.press("ArrowRight");
    expect(
      await focusedIndex(page),
      "the rightmost card in a row must not wrap to the next row's first card",
    ).toBe(2);
  });

  test("edges do not wrap — the leftmost card in a row stays put on ArrowLeft", async ({
    page,
  }) => {
    await openRoute(page, ROUTE, DESKTOP, { readySelector: CARD });
    // Card index 3 is the leftmost of the second row (row 1, columns=3).
    await page.evaluate(() => {
      const card = document.querySelectorAll("[data-testid='animal-card']")[3] as HTMLElement;
      card.tabIndex = 0;
      card.focus();
    });
    expect(await focusedIndex(page)).toBe(3);

    await page.keyboard.press("ArrowLeft");
    expect(
      await focusedIndex(page),
      "the leftmost card in a row must not wrap to the previous row's last card",
    ).toBe(3);
  });

  test("Home jumps to the first card, End jumps to the last", async ({ page }) => {
    await openRoute(page, ROUTE, DESKTOP, { readySelector: CARD });
    await page.locator(CARD).first().focus();

    await page.keyboard.press("End");
    expect(await focusedIndex(page), "End jumps to the last of the 24 seeded cards").toBe(23);

    await page.keyboard.press("Home");
    expect(await focusedIndex(page), "Home jumps back to the first card").toBe(0);
  });

  test("tabindex actually roves — the previous card drops out of the tab order", async ({
    page,
  }) => {
    await openRoute(page, ROUTE, DESKTOP, { readySelector: CARD });
    await page.locator(CARD).first().focus();
    expect(await tabIndexOf(page, 0), "the focused card is the sole tab stop").toBe(0);
    expect(await tabIndexOf(page, 1)).toBe(-1);

    await page.keyboard.press("ArrowRight");
    expect(
      await tabIndexOf(page, 0),
      "moving focus away must drop the old card out of the tab order, not just move focus",
    ).toBe(-1);
    expect(await tabIndexOf(page, 1), "the newly-focused card becomes the sole tab stop").toBe(0);
  });

  test("a filter change re-establishes roving tabindex on the new cards, not stale state", async ({
    page,
  }) => {
    // Deliberately does NOT call .focus() on a card before checking: a
    // programmatic focus() bypasses tabIndex entirely and would pass this
    // test whether or not ArrowKeyGrid actually remounted — proved by
    // mutation-testing a version of this test shaped that way, which kept
    // passing with the remount-forcing `key` removed from page.tsx. Reading
    // the raw `.tabIndex` DOM property on every new card is the assertion
    // that can't be satisfied by accident: if the effect never re-ran on
    // the new card set, every fresh <a> defaults to tabIndex 0 (its native
    // focusable default), not "exactly one card at 0" — the two states are
    // only distinguishable by reading tabIndex directly, not by moving
    // focus and checking where it landed.
    await openRoute(page, ROUTE, DESKTOP, { readySelector: CARD });

    await page.getByTestId("filter-rail").getByRole("link", { name: "Собаки" }).click();
    await page.waitForURL(/vyd=dog/);
    await page.locator(CARD).first().waitFor({ state: "visible" });

    const tabIndices = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[data-testid='animal-card']")).map(
        (el) => (el as HTMLElement).tabIndex,
      ),
    );
    const zeroCount = tabIndices.filter((t) => t === 0).length;
    expect(
      zeroCount,
      `expected exactly one card at tabIndex 0 after the filter change (roving tabindex ` +
        `re-established on the new card set), found ${zeroCount}: [${tabIndices.join(", ")}]`,
    ).toBe(1);
    expect(tabIndices[0], "the first card should be the one tab stop, matching a fresh mount").toBe(
      0,
    );
  });
});

test.describe("/tvaryny arrow-key grid navigation (phone, 1 column)", () => {
  test("ArrowRight/ArrowLeft do nothing — a single column has no horizontal neighbour", async ({
    page,
  }) => {
    await openRoute(page, ROUTE, PHONE, { readySelector: CARD });
    await page.locator(CARD).first().focus();

    await page.keyboard.press("ArrowRight");
    expect(
      await focusedIndex(page),
      "at 1 column, every card is its own row — ArrowRight has no horizontal neighbour to move to",
    ).toBe(0);
  });

  test("ArrowDown moves to the next card — equivalent to reading order at 1 column", async ({
    page,
  }) => {
    await openRoute(page, ROUTE, PHONE, { readySelector: CARD });
    await page.locator(CARD).first().focus();

    await page.keyboard.press("ArrowDown");
    expect(await focusedIndex(page)).toBe(1);
  });
});
