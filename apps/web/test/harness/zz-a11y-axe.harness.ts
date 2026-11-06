/**
 * Accessibility gate: axe (WCAG 2.0/2.1 A and AA rules only) on the key public pages at a phone
 * and a desktop width. Fails on any violation; `incomplete` results (axe could not decide) and
 * best-practice rules are not part of the gate. Own `x-forwarded-for` (TEST-NET-2 .74); the
 * pre-launch gate cookie comes from the shared storage state like every other spec. Named `zz-` so it
 * runs last: run first, it changed which seeded shelter the older specs' unordered scans pick.
 */

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.74" }, trace: "off" });

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const VIEWPORTS = [
  { name: "393x852", width: 393, height: 852 },
  { name: "1280x800", width: 1280, height: 800 },
] as const;
// The seeded verified animal and its shelter (packages/db seed).
const ROUTES = [
  "/tvaryny",
  "/tvaryny/a0000000-0000-4000-8000-000000000000",
  "/prytulky/51000000-0000-4000-8000-000000000000",
  "/zberezheni",
] as const;

for (const viewport of VIEWPORTS) {
  for (const route of ROUTES) {
    test(`axe finds no WCAG A/AA violation on ${route} at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(route, { waitUntil: "load" });
      await page.locator("main").first().waitFor({ state: "visible" });
      const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      expect(
        violations.map((v) => ({
          rule: v.id,
          nodes: v.nodes.map((n) => n.target.join(" >> ")),
        })),
      ).toEqual([]);
    });
  }
}
