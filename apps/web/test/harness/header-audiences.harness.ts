/**
 * Header option B for visitors and signed-in shelters: no layout shift when a visitor with saved
 * animals loads a page, no sideways scroll at the widths we support, nothing in the header
 * overlapping. Flows and boxes only, no looks (CLAUDE.md, "Test logic, not looks").
 *
 * Its own `x-forwarded-for`, as every sibling gives: `proxy.ts`'s per-IP limiter is app-wide.
 */

import { expect, type Page, test } from "@playwright/test";
import { noSidewaysScroll, openRoute, servedAnimalIds } from "./harness";
import type { Viewport } from "./viewports";

test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.91" } });

const HEADER = "[data-testid='site-header']";
const ROUTES = ["/tvaryny", "/prytulkam", "/pro", "/zberezheni"] as const;
const at = (width: number): Viewport => ({ name: `${width} wide`, width, height: 800 });
const WIDTHS: readonly Viewport[] = [320, 360, 393, 1024, 1440].map(at);

async function seedSaved(page: Page, count: number): Promise<void> {
  const ids = await servedAnimalIds(page, count);
  await page.addInitScript((animalIds) => {
    const items = animalIds.map((animalId) => ({ animalId, likedAt: new Date().toISOString() }));
    window.localStorage.setItem("likes.v1", JSON.stringify({ version: 1, items }));
  }, ids);
}

async function signInHint(page: Page): Promise<void> {
  // Presence only is read (`kabinetSignedInFrom`), so a placeholder value is enough for the hint.
  await page
    .context()
    .addCookies([{ name: "kabinet.session_token", value: "hint", domain: "127.0.0.1", path: "/" }]);
}

/** Every visible box in the header, by test id: what a jump after hydration would move. */
async function headerBoxes(page: Page): Promise<Record<string, string>> {
  return page.evaluate((header) => {
    const out: Record<string, string> = {};
    const root = document.querySelector(header);
    if (!root) return out;
    const r0 = root.getBoundingClientRect();
    out.header = [r0.x, r0.y, r0.width, r0.height].map(Math.round).join(",");
    for (const el of root.querySelectorAll("[data-testid]")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      out[el.getAttribute("data-testid") ?? ""] = [r.x, r.y, r.width, r.height]
        .map(Math.round)
        .join(",");
    }
    return out;
  }, HEADER);
}

test.describe("no layout shift: the header is laid out before hydration", () => {
  for (const [name, width] of [
    ["desktop", 1440],
    ["phone", 393],
  ] as const) {
    test(`a visitor with saved animals, ${name}: boxes before and after hydration are the same`, async ({
      page,
    }) => {
      await seedSaved(page, 3);
      // Hold the framework chunks back: the inline pre-paint script still runs, nothing hydrates.
      await page.route("**/_next/static/**/*.js", (route) => route.abort());
      await openRoute(page, "/tvaryny", at(width), { readySelector: HEADER });
      const before = await headerBoxes(page);
      if (width >= 1024) expect(Object.keys(before)).toContain("nav-saved");

      await page.unroute("**/_next/static/**/*.js");
      await page.reload({ waitUntil: "load" });
      await expect(page.locator("[data-testid='nav-saved']")).toHaveAttribute(
        "aria-label",
        "Збережені, 3",
      );
      const after = await headerBoxes(page);

      expect(after).toEqual(before);
    });
  }
});

test.describe("no sideways scroll and no overlap, visitor and shelter", () => {
  for (const audience of ["visitor", "shelter"] as const) {
    for (const viewport of WIDTHS) {
      test(`${audience} at ${viewport.width}: every route fits and the header entries do not overlap`, async ({
        page,
      }) => {
        await seedSaved(page, 150);
        if (audience === "shelter") await signInHint(page);
        for (const route of ROUTES) {
          await openRoute(page, route, viewport, { readySelector: HEADER });
          expect(await noSidewaysScroll(page), `${route} scrolls sideways`).toBe(true);

          const overlaps = await page.evaluate((header) => {
            const root = document.querySelector(header);
            if (!root) return ["no header"];
            const boxes = [...root.querySelectorAll("[data-testid]")]
              .filter((el) => !el.closest("dialog"))
              .map((el) => ({ id: el.getAttribute("data-testid"), r: el.getBoundingClientRect() }))
              .filter(({ r }) => r.width > 0 && r.height > 0);
            const bad: string[] = [];
            for (let i = 0; i < boxes.length; i++) {
              for (let j = i + 1; j < boxes.length; j++) {
                const a = boxes[i]?.r;
                const b = boxes[j]?.r;
                if (!a || !b) continue;
                const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
                const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
                if (x > 1 && y > 1) bad.push(`${boxes[i]?.id} x ${boxes[j]?.id}`);
              }
            }
            return bad;
          }, HEADER);
          expect(overlaps, `${route}: header boxes overlap`).toEqual([]);
        }
      });
    }
  }
});

test.describe("audience rules", () => {
  // D2 (owner, 2026-11-19): «Кабінет притулку» for everyone, sign-in for a visitor; in the row from desktop.
  test("a visitor's «Кабінет притулку» goes to sign-in; a shelter's to the kabinet", async ({
    page,
  }) => {
    await openRoute(page, "/prytulkam", at(1440), { readySelector: HEADER });
    await expect(page.locator("[data-testid='nav-kabinet']")).toBeVisible();
    await expect(page.locator("[data-testid='nav-kabinet']")).toHaveAccessibleName(
      "Кабінет притулку",
    );
    await expect(page.locator("[data-testid='nav-kabinet']")).toHaveAttribute(
      "href",
      "/kabinet/vkhid",
    );

    await signInHint(page);
    await page.reload({ waitUntil: "load" });
    await expect(page.locator("[data-testid='nav-kabinet']")).toBeVisible();
    await expect(page.locator("[data-testid='nav-kabinet']")).toHaveAttribute("href", "/kabinet");
    await expect(page.locator("[data-testid='nav-kabinet-menu']")).toBeHidden();
  });

  test("the current page carries aria-current; on the saved page only the bookmark does", async ({
    page,
  }) => {
    await seedSaved(page, 2);
    await openRoute(page, "/prytulkam", at(1440), { readySelector: HEADER });
    await expect(page.locator("[data-testid='nav-for-shelters']")).toHaveAttribute(
      "aria-current",
      "page",
    );
    await page.goto("/zberezheni");
    await expect(page.locator("[data-testid='nav-saved']")).toHaveAttribute("aria-current", "page");
    await expect(
      page.locator(`${HEADER} nav[aria-label='Opika'] [aria-current='page']`),
    ).toHaveCount(1);
  });

  // M2 (owner, 2026-11-19): the phone row is the logo and the menu trigger; the entry ends the menu.
  for (const width of [320, 393, 1023]) {
    test(`at ${width} the header row has no kabinet button; the menu lists «Збережені», then «Кабінет притулку»`, async ({
      page,
    }) => {
      await seedSaved(page, 3);
      await signInHint(page);
      await openRoute(page, "/tvaryny", at(width), { readySelector: HEADER });
      await expect(page.locator("[data-testid='nav-kabinet']")).toBeHidden();
      await page.locator("[data-testid='nav-menu-trigger']").click();
      const rows = page.locator("[data-testid='nav-menu-sheet'] nav > a:visible");
      await expect(rows).toHaveCount(4);
      await expect(rows.nth(3)).toHaveAttribute("aria-label", "Збережені, 3");
      const entry = page.locator("[data-testid='nav-kabinet-menu']");
      await expect(entry).toBeVisible();
      await expect(entry).toHaveAccessibleName("Кабінет притулку");
      await expect(entry).toHaveAttribute("href", "/kabinet");
      // After the list, in reading order.
      expect(
        await rows
          .nth(3)
          .evaluate(
            (row, id) =>
              Boolean(
                row.compareDocumentPosition(
                  document.querySelector(`[data-testid='${id}']`) as Node,
                ) & Node.DOCUMENT_POSITION_FOLLOWING,
              ),
            "nav-kabinet-menu",
          ),
      ).toBe(true);
    });
  }
});
