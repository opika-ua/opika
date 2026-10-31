/**
 * The pet card's «Про мене» chips and «Медичний стан» block, every mock case of the owner's sketch
 * (2026-10-31), at a phone (393) and a desktop (1440) width, on the dev-only /dev/petcard page.
 * What only a real browser can say: every chip in a section is the same height and none wraps its
 * own text, an over-long chip ellipsises, nothing scrolls sideways. The status words, the source
 * lines and the notes are behaviour, checked by role and text.
 *
 * PETCARD_SHOTS_DIR=<dir> also writes one screenshot per case and width (for the PR).
 */

import { expect, type Page, test } from "@playwright/test";
import { openRoute } from "./harness";
import type { Viewport } from "./viewports";

test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.70" } });

const PHONE_393: Viewport = { name: "393x852 phone", width: 393, height: 852 };
const DESKTOP_1440: Viewport = { name: "1440x900 desktop", width: 1440, height: 900 };
const CASE_IDS = [
  "known",
  "unknown",
  "longest",
  "overlong",
  "long-notes",
  "statuses-only",
  "mixed-source",
] as const;

async function open(page: Page, viewport: Viewport) {
  await openRoute(page, "/dev/petcard", viewport, { readySelector: "h1" });
}

for (const viewport of [PHONE_393, DESKTOP_1440]) {
  test.describe(`pet card cases at ${viewport.name}`, () => {
    test("nothing scrolls sideways", async ({ page }) => {
      await open(page, viewport);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });

    for (const id of CASE_IDS) {
      test(`${id}: every chip is the same height and keeps its text on one line`, async ({
        page,
      }) => {
        await open(page, viewport);
        const chips = page.getByTestId(`case-${id}`).getByTestId("chips").locator("> *");
        const metrics = await chips.evaluateAll((els) =>
          els.map((el) => {
            const text = el.querySelector("span") as HTMLElement;
            return {
              height: el.getBoundingClientRect().height,
              lines: Math.round(
                text.getBoundingClientRect().height /
                  Number.parseFloat(getComputedStyle(text).lineHeight),
              ),
            };
          }),
        );
        expect(metrics.length).toBeGreaterThan(0);
        expect(new Set(metrics.map((m) => m.height)).size).toBe(1);
        expect(metrics.every((m) => m.lines === 1)).toBe(true);
      });

      test(`${id}: screenshot`, async ({ page }) => {
        test.skip(!process.env.PETCARD_SHOTS_DIR, "PETCARD_SHOTS_DIR is not set");
        await open(page, viewport);
        await page
          .getByTestId(`case-${id}`)
          .screenshot({ path: `${process.env.PETCARD_SHOTS_DIR}/${id}-${viewport.width}.png` });
      });
    }

    test("a chip wider than its column ellipsises and keeps its full text", async ({ page }) => {
      await open(page, viewport);
      const long = page.getByTestId("case-overlong").getByText(/^Темперамент, який описали/);
      const clipped = await long.evaluate((el) => {
        const chip = el.parentElement as HTMLElement;
        return (
          el.scrollWidth > el.clientWidth &&
          chip.getBoundingClientRect().width <=
            (chip.parentElement as HTMLElement).getBoundingClientRect().width
        );
      });
      // The 1440 column is wide enough to hold it whole; on the phone it must clip, not wrap.
      if (viewport.width < 600) expect(clipped).toBe(true);
      await expect(long).toHaveText(/довше за будь-який екран телефона$/);
    });

    test("status values: Зроблено, Не зроблено and Невідомо each show on their row", async ({
      page,
    }) => {
      await open(page, viewport);
      const known = page.getByTestId("case-known");
      await expect(known.getByText("Зроблено")).toHaveCount(2);
      const mixed = page.getByTestId("case-unknown");
      await expect(
        mixed.locator("dl > div").filter({ hasText: "Комплексне щеплення" }),
      ).toContainText("Не зроблено");
      await expect(mixed.locator("dl > div").filter({ hasText: "Стерилізація" })).toContainText(
        "Невідомо",
      );
    });

    test("all-shelter case says the source once; the mixed-source case says it per row", async ({
      page,
    }) => {
      await open(page, viewport);
      await expect(page.getByTestId("case-known").getByText("За даними притулку")).toHaveCount(1);
      const mixed = page.getByTestId("case-mixed-source");
      await expect(mixed.getByText("За даними державного реєстру тварин")).toHaveCount(1);
      await expect(mixed.getByText("За даними притулку")).toHaveCount(1);
      await expect(
        mixed.locator("dl > div").filter({ hasText: "Щеплення від сказу" }),
      ).toContainText("За даними державного реєстру тварин");
      await expect(mixed.locator("dl > div").filter({ hasText: "Стерилізація" })).toContainText(
        "За даними притулку",
      );
    });

    test("notes: shown in full when long, and no divider or empty text without them", async ({
      page,
    }) => {
      await open(page, viewport);
      const long = page.getByTestId("case-long-notes").getByText(/^Має хронічний гастрит/);
      const lineClamp = await long.evaluate((el) => getComputedStyle(el).webkitLineClamp);
      expect(lineClamp).toBe("none");
      expect(await long.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
      await expect(page.getByTestId("case-statuses-only").locator("p.border-t")).toHaveCount(0);
    });
  });
}
