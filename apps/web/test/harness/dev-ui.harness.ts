/**
 * The kit's regression test: the /dev/ui showcase (every kit component in every variant) opened at a
 * phone and a desktop width. It checks what only a real browser can: nothing overflows sideways, the
 * kit's interactive primitives meet the 48px target, a focused control shows an indicator, and the
 * overlays do their native job (focus trap, Esc, scroll lock). The no-overflow check is the
 * owner's explicit request for the kit (DS PR 2); the 48px and focus checks are the V-B2 pair
 * pointed at the kit's own primitives, per CLAUDE.md "Test logic, not looks".
 */

import { expect, test } from "@playwright/test";
import { noSidewaysScroll, openRoute } from "./harness";
import type { Viewport } from "./viewports";

const PHONE_360: Viewport = { name: "360x800 phone", width: 360, height: 800 };
const DESKTOP_1440: Viewport = { name: "1440x900 desktop", width: 1440, height: 900 };

const ROUTE = "/dev/ui";
const READY = "h1";

test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.51" } });

for (const viewport of [PHONE_360, DESKTOP_1440]) {
  test.describe(`kit showcase at ${viewport.name}`, () => {
    test("renders every group and does not scroll sideways", async ({ page }) => {
      await openRoute(page, ROUTE, viewport, { readySelector: READY });
      for (const group of [
        "Actions",
        "Chips and badges",
        "Form controls",
        "Overlays",
        "Feedback",
      ]) {
        await expect(page.getByRole("heading", { level: 2, name: group })).toBeVisible();
      }
      expect(await noSidewaysScroll(page), "the page scrolls sideways").toBe(true);
    });

    test("every button, link, chip and field is at least 48px tall", async ({ page }) => {
      await openRoute(page, ROUTE, viewport, { readySelector: READY });
      const short = await page.evaluate(() => {
        const out: string[] = [];
        const targets = document.querySelectorAll<HTMLElement>(
          "main button, main input:not(.sr-only), main select, main textarea, main a[href]",
        );
        for (const el of targets) {
          // Inside a closed dialog: not laid out, not a target.
          if (el.getClientRects().length === 0) continue;
          // Decorative and out of the tab order (the Toggle's track).
          if (el.closest('[aria-hidden="true"]')) continue;
          // Prose links sit inside a text block, and a chip's input is inside its 48px label.
          if (el.closest("p, span.text-body, [data-inline-link]")) continue;
          if (el.matches("input[type=radio], input[type=checkbox]")) continue;
          const min = Number.parseFloat(getComputedStyle(el).minHeight);
          const height = el.getBoundingClientRect().height;
          if (Math.max(min, height) < 48) {
            out.push(
              `${el.tagName} «${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim()}» ${height}px`,
            );
          }
        }
        return out;
      });
      expect(short, "controls under 48px").toEqual([]);
    });
  });
}

test.describe("kit behaviour in a real browser", () => {
  test("tabbing to a button shows a focus indicator", async ({ page }) => {
    await openRoute(page, ROUTE, PHONE_360, { readySelector: READY });
    const primary = page.getByRole("button", { name: "Primary", exact: true });
    let reached = false;
    for (let i = 0; i < 40 && !reached; i += 1) {
      await page.keyboard.press("Tab");
      reached = await primary.evaluate((el) => el === document.activeElement);
    }
    expect(reached, "the primary button is reachable by Tab").toBe(true);
    const indicator = await primary.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        focusVisible: el.matches(":focus-visible"),
        outline: style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) > 0,
      };
    });
    expect(indicator.focusVisible).toBe(true);
    expect(indicator.outline).toBe(true);
  });

  test("Modal traps focus, closes on Esc, locks page scroll and gives focus back", async ({
    page,
  }) => {
    await openRoute(page, ROUTE, PHONE_360, { readySelector: READY });
    const opener = page.getByRole("button", { name: "Open modal" });
    await opener.click();
    const dialog = page.getByRole("dialog", { name: "Modal title" });
    await expect(dialog).toBeVisible();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press("Tab");
      // A native modal dialog makes the page behind inert; Tab at the end hands focus to the
      // browser's own UI (activeElement becomes body), never to the page underneath.
      const inside = await page.evaluate(
        () =>
          document.activeElement === document.body ||
          document.activeElement?.closest("dialog[open]") != null,
      );
      expect(inside, `focus never reached the page behind the modal after Tab ${i + 1}`).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    // The lock is released by React after the native close event, so wait for it, not the clock.
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("");
    await expect(opener).toBeFocused();
  });

  test("Sheet opens from its link and closes on Esc", async ({ page }) => {
    await openRoute(page, ROUTE, PHONE_360, { readySelector: READY });
    await page.getByRole("link", { name: "Sheet", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Sheet" });
    await expect(sheet).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  });

  test("Sheet opens with no JS, through the hash alone", async ({ browser }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 360, height: 800 },
      extraHTTPHeaders: { "x-forwarded-for": "198.51.100.52" },
    });
    const page = await context.newPage();
    await page.goto(`${ROUTE}#dev-ui-sheet`, { waitUntil: "load" });
    await expect(page.getByRole("dialog", { name: "Sheet" })).toBeVisible();
    await context.close();
  });

  test("Popover opens, shows its choices and closes on Esc with focus back on the trigger", async ({
    page,
  }) => {
    await openRoute(page, ROUTE, PHONE_360, { readySelector: READY });
    const trigger = page.getByRole("button", { name: "Місто: будь-яке" });
    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("radio", { name: "Kyiv" })).toBeAttached();
    await page.keyboard.press("Escape");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toBeFocused();
  });

  test("Tabs switch panel with the arrow keys; a Toast announces and can be dismissed", async ({
    page,
  }) => {
    await openRoute(page, ROUTE, PHONE_360, { readySelector: READY });
    const first = page.getByRole("tab", { name: "One" });
    await first.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Two" })).toBeFocused();
    await expect(page.getByRole("tabpanel", { name: "Two" })).toBeVisible();

    await page.getByRole("button", { name: "Show toast", exact: true }).click();
    const toast = page.locator('[aria-live="polite"]').getByText("Saved");
    await expect(toast).toBeVisible();
    await page.locator('[aria-live="polite"]').getByRole("button", { name: "Dismiss" }).click();
    await expect(toast).toBeHidden();
  });
});

test("an InfoTip opened near the bottom of the screen opens above its trigger", async ({
  page,
}) => {
  await openRoute(page, ROUTE, PHONE_360, { readySelector: READY });
  const trigger = page.getByRole("button", { name: "Near the bottom" });
  // Scrolled until the trigger is 8px from the bottom edge, whatever the page below it.
  await trigger.evaluate((node) => {
    node.scrollIntoView({ block: "end" });
    window.scrollBy(0, node.getBoundingClientRect().bottom - (window.innerHeight - 8));
  });
  // A script click: Playwright's own click would scroll the trigger back to the middle.
  await trigger.evaluate((node) => (node as HTMLElement).click());
  const card = page.getByRole("note", { name: "Near the bottom" });
  await expect(card).toBeVisible();
  const cardBox = await card.boundingBox();
  const triggerBox = await trigger.boundingBox();
  // The card may touch the trigger's 10px of empty hit area, never the circle itself.
  expect((cardBox?.y ?? 0) + (cardBox?.height ?? 0)).toBeLessThanOrEqual((triggerBox?.y ?? 0) + 10);
  expect(cardBox?.y).toBeGreaterThanOrEqual(0);
});
