/**
 * A small rendering harness over Playwright.
 *
 * It exists because three milestones in a row were signed off on checks that
 * confirmed the shape of the code rather than its behaviour - most sharply at
 * M5, where "the /discovery page renders" was concluded by fetching the HTML
 * and grepping it for card text, while the action row sat on top of the card
 * and the gesture did not work at all.
 *
 * So what this file provides is what grepping markup cannot do: drive a real
 * pointer sequence and a real tab order through the real event loop.
 *
 * 2026-10-20: the layout-measuring helpers (overlap, containment, margins,
 * viewport overflow, touch-target boxes, row counts, contrast, `sizes` and
 * srcset resolution) are gone, removed with the tests that used them
 * (Oleksii, 2026-10-20, verbatim: "UI-measuring tests: yes, keep both V-B2
 * tests (the 48px shared controls and the focus indicator being present).
 * They’re accessibility guarantees, not looks. Drop the rest that measure
 * appearance."). See CLAUDE.md, "Test logic, not looks".
 *
 * It is a verification tool, not a framework. Everything here is a thin,
 * well-labelled wrapper whose value is the failure message.
 */

import { expect, type Locator, type Page } from "@playwright/test";
import type { Viewport } from "./viewports";

/** A DOM rectangle in CSS pixels, as `Locator.boundingBox()` returns it. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A locator with a human name, so failures say which element it was. */
export interface Measured {
  readonly label: string;
  readonly locator: Locator;
}

/**
 * Load a route at an exact viewport size.
 *
 * `readySelector` is awaited rather than a fixed sleep: a client component mounts on the
 * client, and asserting before hydration tests the wrong thing.
 */
export async function openRoute(
  page: Page,
  route: string,
  viewport: Viewport,
  opts: { readonly readySelector?: string } = {},
): Promise<void> {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(route, { waitUntil: "load" });
  if (opts.readySelector) {
    await page.locator(opts.readySelector).first().waitFor({ state: "visible" });
  }
}

/** Bounding box, or a failure that names the element instead of `null`. */
export async function rectOf(locator: Locator, label: string): Promise<Rect> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error(
      `${label}: no bounding box. The element is absent, detached, or not rendered ` +
        `(display:none / zero-size). Selector: ${locator}`,
    );
  }
  return box;
}

/**
 * Real Tab presses, not `locator.focus()`: `focus()` succeeds on a
 * `tabindex="-1"` element (removed from the tab order), so a `focus()`-based
 * check can't fail for the reason a keyboard-operation test needs to fail
 * for. This walks the real tab order and asserts `target` is in it.
 *
 * Reachability only, not appearance. Until 2026-10-20 this was
 * `expectFocusVisibleOutline` and also asserted the focused element's
 * computed outline width and offset; those were measurements of how focus
 * looks, removed with the other UI-measuring tests (Oleksii, 2026-10-20,
 * verbatim: "Drop the rest that measure appearance."). The one focus
 * indicator presence test V-B2 keeps lives in
 * `kabinet-profile-edit.harness.ts`.
 */
export async function expectReachableByTab(
  page: Page,
  target: Measured,
  maxTabPresses = 25,
): Promise<void> {
  const handle = await target.locator.elementHandle();
  if (!handle) throw new Error(`${target.label}: element not found, cannot Tab to it`);

  let presses = 0;
  let reached = false;
  while (presses < maxTabPresses && !reached) {
    await page.keyboard.press("Tab");
    presses += 1;
    reached = await page.evaluate((el) => document.activeElement === el, handle);
  }

  expect(reached, `${target.label} was not reached within ${maxTabPresses} Tab presses`).toBe(true);
}

/** True when the page does not scroll sideways (an accessibility floor, not a look). Used by every spec that checks the page does not overflow. */
export function noSidewaysScroll(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
}

/**
 * One TEST-NET-1 client address per repetition: the gallery is rate-limited per IP and
 * `--repeat-each` loads it often. Call inside a `beforeEach` hook.
 */
export async function useClientAddressPerRepetition(
  page: Page,
  testInfo: { readonly repeatEachIndex: number },
): Promise<void> {
  const lastOctet = 1 + (testInfo.repeatEachIndex % 254);
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `192.0.2.${lastOctet}` });
}

/** Fills the kit's DateField named `legend` inside `scope` with an ISO date: day, month by number, year. */
export async function fillDateField(scope: Locator, legend: string, iso: string): Promise<void> {
  const [year = "", month = "", day = ""] = iso.split("-");
  const group = scope.getByRole("group", { name: legend });
  await group.getByLabel("День", { exact: true }).fill(String(Number(day)));
  await group.getByLabel("Місяць", { exact: true }).selectOption(String(Number(month)));
  await group.getByLabel("Рік", { exact: true }).fill(year);
}

/** The touch-target floor: the control's box is at least 48px tall. */
export async function expectMinTargetHeight(locator: Locator, minimum = 48): Promise<void> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error("the control has no box (not rendered or hidden)");
  if (box.height < minimum) throw new Error(`target height ${box.height}px is under ${minimum}px`);
}

/**
 * What every tab row must keep (tabs-polish): at most 48px tall, no vertical scroll, a pointer on
 * every tab, and the keyboard focus ring of the first tab inside the row's clip.
 */
export async function expectTabRowSound(page: Page, row: Locator): Promise<void> {
  const measured = await row.evaluate((node) => {
    const tabs = [...node.querySelectorAll<HTMLElement>('[role="tab"]')];
    const first = tabs[0];
    if (first === undefined) throw new Error("no tab");
    return {
      height: node.getBoundingClientRect().height,
      overflow: node.scrollHeight - node.clientHeight,
      cursors: tabs.map((tab) => getComputedStyle(tab).cursor),
    };
  });
  expect(measured.height).toBeLessThanOrEqual(48);
  expect(measured.overflow).toBeLessThanOrEqual(0);
  expect(measured.cursors.length).toBeGreaterThan(0);
  for (const cursor of measured.cursors) expect(cursor).toBe("pointer");

  // A key press first, so the programmatic focus counts as keyboard focus.
  await page.keyboard.press("Shift");
  await row.getByRole("tab").first().focus();
  const ring = await row.evaluate((node) => {
    const tab = node.querySelector<HTMLElement>('[role="tab"]');
    if (tab === null) throw new Error("no tab");
    const style = getComputedStyle(tab);
    const rowStyle = getComputedStyle(node);
    const reach = Number.parseFloat(style.outlineWidth) + Number.parseFloat(style.outlineOffset);
    const clip = node.getBoundingClientRect();
    const box = tab.getBoundingClientRect();
    return {
      drawn: style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) > 0,
      top: box.top - reach - (clip.top + Number.parseFloat(rowStyle.borderTopWidth)),
      bottom: clip.bottom - Number.parseFloat(rowStyle.borderBottomWidth) - (box.bottom + reach),
      left: box.left - reach - clip.left,
    };
  });
  expect(ring.drawn).toBe(true);
  expect(ring.top).toBeGreaterThanOrEqual(0);
  expect(ring.bottom).toBeGreaterThanOrEqual(0);
  expect(ring.left).toBeGreaterThanOrEqual(0);
}

/**
 * Opens the kabinet header's account menu. The button is server-rendered before React attaches its
 * handler, so a click that lands early does nothing: press until the menu's own `ready` element
 * shows (a press that did land late would close it again, and the next press reopens it).
 */
export async function openAccountMenu(page: Page, ready: Locator): Promise<void> {
  const button = page.getByRole("banner").getByRole("button");
  await expect(async () => {
    // Only press while it reads closed: React may replay an early press once it hydrates.
    if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
    await expect(ready).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });
}

/**
 * Ids of animals the seeded gallery really serves. The header's saved count drops ids the server
 * does not serve, so a spec that seeds `likes.v1` needs real ones, not made-up uuids.
 */
export async function servedAnimalIds(page: Page, count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let pageNumber = 1; ids.length < count && pageNumber <= 20; pageNumber++) {
    await page.goto(`/tvaryny?stor=${pageNumber}`, { waitUntil: "load" });
    const found = await page
      .locator("[data-testid='animal-card']")
      .evaluateAll((cards) =>
        cards
          .map((card) => card.getAttribute("href")?.match(/\/tvaryny\/([0-9a-f-]{36})/)?.[1])
          .filter((id): id is string => id !== undefined),
      );
    ids.push(...found.filter((id) => !ids.includes(id)));
  }
  expect(ids.length, "the seeded gallery has enough animals").toBeGreaterThanOrEqual(count);
  return ids.slice(0, count);
}
