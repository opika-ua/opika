/**
 * PR B, the SEO review of page titles - against a real server, not inspected markup
 * (`docs/standing-constraints.md`: "a claim verified against shape is not verified").
 * This project has shipped a wrong title before and only caught it by diffing the
 * served output (`/tvaryny/[animalId]/page.tsx`'s own PR #53 comment), so this file
 * checks `page.title()` directly rather than trusting the metadata object's shape.
 */

import { expect, test } from "@playwright/test";
import { openRoute } from "./harness";
import { DETAIL_DESKTOP } from "./viewports";

const CARD = "[data-testid='animal-card']";
/** The owner's exact separator (PR B, verbatim: "The title separator is « – » (U+2013)"). */
const EN_DASH_SEPARATOR = " – Opika";

// One address per repetition (TEST-NET-1, as in gallery-animal-overlay): the limiter is per IP,
// and `--repeat-each`, which is how a flake here is shown gone, outruns it.
test.beforeEach(async ({ page }, testInfo) => {
  const lastOctet = 1 + (testInfo.repeatEachIndex % 254);
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `192.0.2.${lastOctet}` });
});

test("/tvaryny's title is SEO handoff B2's, ending in the owner's en-dash separator and the brand", async ({
  page,
}) => {
  await openRoute(page, "/tvaryny", DETAIL_DESKTOP, { readySelector: CARD });
  const title = await page.title();
  expect(title.endsWith(EN_DASH_SEPARATOR)).toBe(true);
  expect(title).toBe(`Взяти собаку чи кота з притулку${EN_DASH_SEPARATOR}`);
  // The separator is the en dash, nothing else - a hyphen or an em dash is a regression.
  expect(title).not.toContain(" - Opika");
  expect(title).not.toContain(" — Opika");
});

test("the privacy policy's title is «Політика конфіденційності – Opika»", async ({ page }) => {
  await openRoute(page, "/polityka-konfidentsiinosti", DETAIL_DESKTOP);
  expect(await page.title()).toBe(`Політика конфіденційності${EN_DASH_SEPARATOR}`);
});

test("an animal page's title is SEO handoff B2's, dropping « – Opika» only past 60 characters", async ({
  page,
}) => {
  await openRoute(page, "/tvaryny", DETAIL_DESKTOP, { readySelector: CARD });
  const href = await page.locator(CARD).first().getAttribute("href");
  await page.goto(href as string);
  const title = await page.title();
  expect(title).toMatch(/^.+ – (цуценя|собака|кошеня|кіт|кішка) шукає дім, .+?( – Opika)?$/u);
  expect(title.endsWith(EN_DASH_SEPARATOR)).toBe(Array.from(title).length <= 60);
  expect(title).not.toContain("|");
});

test("the shelter page's title is SEO handoff B2's, dropping « – Opika» only past 60 characters", async ({
  page,
}) => {
  await openRoute(page, "/tvaryny", DETAIL_DESKTOP, { readySelector: CARD });
  const href = await page.locator(CARD).first().getAttribute("href");
  await page.goto(href as string);
  const animalTitle = await page.title();
  const shelterLink = page.locator("a[href^='/prytulky/']");
  await shelterLink.click();
  await page.waitForURL(/\/prytulky\//);
  await page.getByRole("heading", { level: 1 }).waitFor();
  // Next streams `generateMetadata` apart from the body, so the soft navigation can commit the
  // shelter page with no `<title>` yet ("" in CI run 41051822696): wait for its own to land.
  await page.waitForFunction(
    (previous) => document.title !== "" && document.title !== previous,
    animalTitle,
  );
  const title = await page.title();
  expect(title).toMatch(/^.+ – тварини шукають дім, .+?( – Opika)?$/u);
  expect(title.endsWith(EN_DASH_SEPARATOR)).toBe(Array.from(title).length <= 60);
  expect(title).not.toContain("|");
});
