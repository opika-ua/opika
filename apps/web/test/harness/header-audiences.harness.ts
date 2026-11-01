/**
 * Header option B for visitors and signed-in shelters: no layout shift when a visitor with saved
 * animals loads a page, no sideways scroll at the widths we support, nothing in the header
 * overlapping. Flows and boxes only, no looks (CLAUDE.md, "Test logic, not looks").
 *
 * Its own `x-forwarded-for`, as every sibling gives: `proxy.ts`'s per-IP limiter is app-wide.
 */

import { expect, type Page, test } from "@playwright/test";
import { noSidewaysScroll, openRoute } from "./harness";
import type { Viewport } from "./viewports";

test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.61" } });

const HEADER = "[data-testid='site-header']";
const ROUTES = ["/tvaryny", "/prytulkam", "/pro", "/zberezheni"] as const;
const at = (width: number): Viewport => ({ name: `${width} wide`, width, height: 800 });
const WIDTHS: readonly Viewport[] = [320, 360, 393, 1024, 1440].map(at);

async function seedSaved(page: Page, count: number): Promise<void> {
  await page.addInitScript((n) => {
    const items = Array.from({ length: n }, (_, i) => ({
      animalId: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      likedAt: new Date().toISOString(),
    }));
    window.localStorage.setItem("likes.v1", JSON.stringify({ version: 1, items }));
  }, count);
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
  test("a visitor has no «Кабінет» anywhere; a shelter has the pill and the drawer row", async ({
    page,
  }) => {
    await openRoute(page, "/prytulkam", at(1440), { readySelector: HEADER });
    await expect(page.locator("[data-testid^='nav-kabinet']")).toHaveCount(0);
    // The visitor's way in is the link on this very page.
    await expect(page.getByRole("link", { name: "Увійти в кабінет" })).toBeVisible();

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

  test("the burger menu lists «Збережені» with its count and, for a shelter, «Кабінет» last", async ({
    page,
  }) => {
    await seedSaved(page, 3);
    await signInHint(page);
    await openRoute(page, "/tvaryny", at(393), { readySelector: HEADER });
    await page.locator("[data-testid='nav-menu-trigger']").click();
    const rows = page.locator("[data-testid='nav-menu-sheet'] nav > a:visible");
    await expect(rows).toHaveCount(5);
    await expect(rows.nth(3)).toHaveAttribute("aria-label", "Збережені, 3");
    await expect(rows.last()).toHaveAttribute("href", "/kabinet");
  });
});
