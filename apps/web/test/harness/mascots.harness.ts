/**
 * Brand mascots: decorative accents that must never get in the way. Behaviour only: a mascot never
 * takes a click, never overflows a 360px phone, and no screen shows two mascot moments at once.
 * Set MASCOT_SHOTS_DIR to also save the review screenshots (1440, 393, 360 and 320, every placement).
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createDatabase } from "@opika/db";
import { shelters } from "@opika/db/schema";
import { assertDisposableTestDatabase, testDatabaseUrl } from "@opika/db/test";
import { expect, type Page, test } from "@playwright/test";
import { noSidewaysScroll, openRoute } from "./harness";
import type { Viewport } from "./viewports";

const HARNESS_DATABASE_URL = assertDisposableTestDatabase(testDatabaseUrl("harness"));
const SHOTS_DIR = process.env["MASCOT_SHOTS_DIR"];

const DESKTOP_1440: Viewport = { name: "1440x900", width: 1440, height: 900 };
const PHONE_393: Viewport = { name: "393x852", width: 393, height: 852 };
const PHONE_320: Viewport = { name: "320x640", width: 320, height: 640 };
const PHONE_360: Viewport = { name: "360x740", width: 360, height: 740 };

test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.65" } });

const MOMENT = "[data-mascot-group], [data-mascot]:not([data-mascot-group] [data-mascot])";

/** Per mascot moment (a group counts once): where it is, and what is under its centre point. */
async function moments(page: Page) {
  return page.locator(MOMENT).evaluateAll((nodes) =>
    // A mascot hidden by the breakpoint (display: none) is no moment.
    nodes
      .filter((node) => node.getBoundingClientRect().width > 0)
      .map((node) => {
        const box = node.getBoundingClientRect();
        const top = box.top + window.scrollY;
        const under = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return {
          top,
          width: box.width,
          left: box.left,
          right: box.right,
          viewportWidth: window.innerWidth,
          key: node.getAttribute("data-mascot") ?? "group",
          // Off screen, elementFromPoint is null: a click can only be taken where the mascot is shown.
          onScreen: box.bottom > 0 && box.top < window.innerHeight,
          underIsMascot: under?.closest("[data-mascot], [data-mascot-group]") != null,
        };
      }),
  );
}

async function expectWellBehaved(page: Page, viewport: Viewport) {
  const found = await moments(page);
  for (const mascot of found) {
    expect(mascot.width, `${mascot.key} has a size`).toBeGreaterThan(0);
    if (mascot.onScreen) {
      expect(mascot.underIsMascot, `${mascot.key} takes no click`).toBe(false);
    }
  }
  // Two moments are fine only when no single screen can hold both.
  const tops = found.map((m) => m.top).sort((a, b) => a - b);
  for (let i = 1; i < tops.length; i++) {
    expect(
      (tops[i] as number) - (tops[i - 1] as number),
      "two mascot moments never share a screen",
    ).toBeGreaterThanOrEqual(viewport.height);
  }
  expect(await noSidewaysScroll(page), `no horizontal overflow at ${viewport.name}`).toBe(true);
  // A mascot stays inside the 16px content gutter, whatever the width (clipped overflow hides).
  for (const mascot of found) {
    expect(
      mascot.left,
      `${mascot.key} inside the left gutter at ${viewport.name}`,
    ).toBeGreaterThanOrEqual(16);
    expect(
      mascot.viewportWidth - mascot.right,
      `${mascot.key} inside the right gutter at ${viewport.name}`,
    ).toBeGreaterThanOrEqual(16);
  }
  return found;
}

async function shoot(page: Page, name: string, viewport: Viewport, scrollTo?: string) {
  if (SHOTS_DIR === undefined) return;
  mkdirSync(SHOTS_DIR, { recursive: true });
  if (scrollTo !== undefined) {
    await page.locator(scrollTo).first().scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 120));
  }
  await page.screenshot({
    path: join(SHOTS_DIR, `${name}-${viewport.width}.png`),
    animations: "disabled",
  });
}

interface Placement {
  name: string;
  route: string;
  ready: string;
  /** The `data-mascot` keys that page shows, in page order ("group" is a seated pair). */
  expected: readonly string[];
  scrollTo?: string;
}

const CARD = "[data-testid='animal-card']";
const PLACEMENTS: readonly Placement[] = [
  { name: "1-hero-cat", route: "/tvaryny", ready: CARD, expected: ["cat-lie"] },
  { name: "1-hero-dog", route: "/tvaryny?vyd=dog", ready: CARD, expected: ["dog-lie"] },
  {
    name: "2a-no-match-cat",
    route: "/tvaryny?vyd=cat&rozmir=large",
    ready: "[data-testid='gallery-no-match']",
    expected: ["cat-lie"],
  },
  {
    name: "2a-no-match-dog",
    route: "/tvaryny?vyd=dog&obl=zhytomyrska",
    ready: "[data-testid='gallery-no-match']",
    expected: ["dog-lie"],
  },
  {
    name: "6-list-end-cat",
    route: "/tvaryny?stor=50",
    ready: "[data-testid='gallery-list-end']",
    expected: ["cat-lie", "cat-stand-tail"],
    scrollTo: "[data-testid='gallery-list-end']",
  },
  {
    name: "6-list-end-dog",
    route: "/tvaryny?vyd=dog&stor=50",
    ready: "[data-testid='gallery-list-end']",
    expected: ["dog-lie", "dog-stand"],
    scrollTo: "[data-testid='gallery-list-end']",
  },
  {
    name: "3-not-found-card",
    route: "/tvaryny/00000000-0000-4000-8000-000000000000",
    ready: "[data-testid='not-found-action']",
    expected: ["cat-sit-collar"],
  },
  {
    name: "3-not-found-site",
    route: "/no-such-page",
    ready: "[data-testid='not-found-action']",
    expected: ["cat-sit-collar"],
  },
  {
    name: "3-not-found-shelter",
    route: "/prytulky/00000000-0000-4000-8000-000000000000",
    ready: "main",
    expected: ["cat-sit-collar"],
  },
  {
    name: "3-error",
    route: "/tvaryny?opika_test_fail=1",
    ready: "[data-testid='gallery-error']",
    expected: ["cat-sit-collar"],
  },
  { name: "7-about", route: "/pro", ready: "main", expected: ["group"] },
];

for (const viewport of [DESKTOP_1440, PHONE_393, PHONE_360, PHONE_320]) {
  test.describe(`mascots at ${viewport.name}`, () => {
    for (const placement of PLACEMENTS) {
      test(`${placement.name}: shows exactly its mascots, takes no click, no overflow`, async ({
        page,
      }) => {
        await openRoute(page, placement.route, viewport, { readySelector: placement.ready });
        const found = await expectWellBehaved(page, viewport);
        expect(
          found.sort((a, b) => a.top - b.top).map((m) => m.key),
          `${placement.name} mascots`,
        ).toEqual(placement.expected);
        await shoot(page, placement.name, viewport, placement.scrollTo);
      });
    }

    test("4-reveal: the contact dialog seats the cat and the dog together as one moment", async ({
      page,
    }) => {
      await openRoute(page, "/tvaryny", viewport, { readySelector: CARD });
      const href = await page.locator(CARD).first().getAttribute("href");
      await page.goto(href as string, { waitUntil: "load" });
      await page.getByTestId("reveal-trigger").click();
      await page.getByTestId("reveal-dialog").waitFor({ state: "visible" });
      const found = await expectWellBehaved(page, viewport);
      expect(found.map((m) => m.key)).toEqual(["group"]);
      await expect(page.getByTestId("reveal-dialog").locator("[data-mascot-group]")).toHaveCount(1);
      // The close button stays usable: the mascots sit above the dialog, not on its controls.
      await expect(page.getByTestId("reveal-close")).toBeVisible();
      await shoot(page, "4-reveal", viewport);
    });

    test("2b-shelter-no-animals: the empty shelter page shows one mascot", async ({ page }) => {
      const db = createDatabase(HARNESS_DATABASE_URL);
      const [source] = (await db.select().from(shelters)).filter(
        (row) => row.verificationStatus === "verified",
      );
      if (source === undefined) throw new Error("the seed has no verified shelter");
      const id = crypto.randomUUID() as typeof source.id;
      await db
        .insert(shelters)
        .values({ ...source, id, organizationId: null, displayName: `Порожній ${viewport.width}` });
      await openRoute(page, `/prytulky/${id}`, viewport, {
        readySelector: "[data-testid='shelter-no-animals']",
      });
      const found = await expectWellBehaved(page, viewport);
      expect(found.map((m) => m.key)).toEqual(["cat-sit-collar"]);
      await shoot(page, "2b-shelter-no-animals", viewport);
    });
  });
}

/**
 * Word perch: the mascot is centred on the last word of the heading's first line and its feet sit on
 * that word's cap line. Its own client address, so the extra loads never spend the budget above.
 */
const PERCH_WIDTHS = [320, 360, 393, 1024, 1440] as const;
const PERCH_VARIANTS = [
  { name: "hero-cat", route: "/tvaryny", ready: CARD, heading: "h1", key: "cat-lie" },
  { name: "hero-dog", route: "/tvaryny?vyd=dog", ready: CARD, heading: "h1", key: "dog-lie" },
  {
    name: "no-match",
    route: "/tvaryny?vyd=cat&rozmir=large",
    ready: "[data-testid='gallery-no-match']",
    heading: "#gallery-no-match-heading",
    key: "cat-lie",
  },
] as const;

test.describe("mascot on a word", () => {
  test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.66" } });

  for (const variant of PERCH_VARIANTS) {
    for (const width of PERCH_WIDTHS) {
      test(`${variant.name} at ${width}: centred on the anchor word, feet on its cap line, clear of the chrome`, async ({
        page,
      }) => {
        const viewport: Viewport = { name: `${width}`, width, height: 800 };
        await openRoute(page, variant.route, viewport, { readySelector: variant.ready });
        await page.evaluate(() => document.fonts.ready);
        const m = await page
          .locator(variant.heading)
          .first()
          .evaluate(async (heading, key) => {
            await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
            const mascot = heading.querySelector(`[data-mascot='${key}']`) as SVGElement | null;
            if (mascot === null) return null;
            const anchor = mascot.parentElement as HTMLElement;
            const words = Array.from(heading.querySelectorAll<HTMLElement>("[data-word]"));
            const textNode = Array.from(anchor.childNodes).find((n) => n.nodeType === 3) as Text;
            const range = document.createRange();
            range.selectNodeContents(textNode);
            const word = range.getBoundingClientRect();
            const style = getComputedStyle(anchor);
            const ctx = document
              .createElement("canvas")
              .getContext("2d") as CanvasRenderingContext2D;
            ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
            // The letters' top: lowercase, which is what the anchor words are made of.
            const capHeight = ctx.measureText("н").actualBoundingBoxAscent;
            const ascent = ctx.measureText("н").fontBoundingBoxAscent;
            const capTop = word.top + ascent - capHeight;
            const box = mascot.getBoundingClientRect();
            const index = words.indexOf(anchor);
            const lineTop = words[0]?.offsetTop ?? 0;
            const obstacles = Array.from(
              document.querySelectorAll<HTMLElement>(
                "header, header a, a[href], button, input, select, [role='tab'], [role='radio']",
              ),
            )
              .filter((el) => !heading.contains(el) && el.getBoundingClientRect().width > 0)
              .map((el) => el.getBoundingClientRect())
              .filter(
                (r) =>
                  r.left < box.right &&
                  r.right > box.left &&
                  r.top < box.bottom &&
                  r.bottom > box.top,
              ).length;
            return {
              anchorWord: anchor.textContent,
              dx: Math.abs(box.left + box.width / 2 - (word.left + word.width / 2)),
              dy: box.bottom - capTop,
              onFirstLine: anchor.offsetTop === lineTop,
              nextWrapped:
                words[index + 1] === undefined || words[index + 1]?.offsetTop !== lineTop,
              obstacles,
            };
          }, variant.key);
        expect(m, "the heading carries its mascot").not.toBeNull();
        if (m === null) return;
        expect(m.onFirstLine && m.nextWrapped, "anchor is the last word of the first line").toBe(
          true,
        );
        // The gallery title scales down below 360px so «дім» never leaves the first line.
        if (variant.name.startsWith("hero")) {
          expect(m.anchorWord, "the mascot sits on «дім»").toBe("дім");
        }
        expect(m.dx, "centre within 4px of the word's centre").toBeLessThanOrEqual(4);
        expect(
          Math.abs(m.dy - 1),
          "feet within 2px of the cap top (1px overlap)",
        ).toBeLessThanOrEqual(2);
        expect(m.obstacles, "no overlap with the header, logo or filters").toBe(0);
        expect(await noSidewaysScroll(page)).toBe(true);
        const gutters = await moments(page);
        for (const g of gutters) {
          expect(g.left).toBeGreaterThanOrEqual(16);
          expect(g.viewportWidth - g.right).toBeGreaterThanOrEqual(16);
        }
        await shoot(page, `perch-${variant.name}`, viewport);
      });
    }
  }
});
