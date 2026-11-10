/**
 * Accessibility gate: axe (WCAG 2.0/2.1 A and AA rules only) on the key public pages at a phone
 * and a desktop width, plus the one best-practice rule `landmark-one-main` (a missing main landmark
 * is a real screen-reader defect that Lighthouse caught on the empty gallery). Fails on any
 * violation; `incomplete` results (axe could not decide) and other best-practice rules are not
 * part of the gate. Own `x-forwarded-for` (TEST-NET-2 .74). Named `zz-` so it
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
const ROUTES: readonly { path: string; ready?: string }[] = [
  { path: "/tvaryny" },
  // Zhytomyr holds no seeded animal: the gallery's empty state, which has no grid.
  { path: "/tvaryny?obl=zhytomyrska", ready: "[data-testid='gallery-no-match']" },
  { path: "/tvaryny/a0000000-0000-4000-8000-000000000000" },
  { path: "/prytulky/51000000-0000-4000-8000-000000000000" },
  { path: "/zberezheni" },
];

for (const viewport of VIEWPORTS) {
  for (const { path: route, ready } of ROUTES) {
    test(`axe finds no WCAG A/AA or landmark-one-main violation on ${route} at ${viewport.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(route, { waitUntil: "load" });
      // A route with its own ready element does not wait for `main`: a missing main must reach
      // axe and fail as `landmark-one-main`, not as a locator timeout.
      await page
        .locator(ready ?? "main")
        .first()
        .waitFor({ state: "visible" });
      // Two runs: withTags and withRules both set runOnly and the last call wins, so chaining
      // them would silently drop the WCAG rules.
      const wcag = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      const landmark = await new AxeBuilder({ page }).withRules(["landmark-one-main"]).analyze();
      const violations = [...wcag.violations, ...landmark.violations];
      expect(
        violations.map((v) => ({
          rule: v.id,
          nodes: v.nodes.map((n) => n.target.join(" >> ")),
        })),
      ).toEqual([]);
    });
  }
}
