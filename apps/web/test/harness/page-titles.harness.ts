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

test("/tvaryny's title is the subject, then the owner's en-dash separator, then the brand", async ({
  page,
}) => {
  await openRoute(page, "/tvaryny", DETAIL_DESKTOP, { readySelector: CARD });
  const title = await page.title();
  expect(title.endsWith(EN_DASH_SEPARATOR)).toBe(true);
  expect(title).toBe(`Собаки й коти з притулків України${EN_DASH_SEPARATOR}`);
  // The separator is the en dash, nothing else - a hyphen or an em dash is a regression.
  expect(title).not.toContain(" - Opika");
  expect(title).not.toContain(" — Opika");
});

test("an animal page's title is name, species, city, then the brand", async ({ page }) => {
  await openRoute(page, "/tvaryny", DETAIL_DESKTOP, { readySelector: CARD });
  const href = await page.locator(CARD).first().getAttribute("href");
  await page.goto(href as string);
  const title = await page.title();
  expect(title.endsWith(EN_DASH_SEPARATOR)).toBe(true);
  // Subject has three comma-separated parts: name, species, city.
  const subject = title.slice(0, -EN_DASH_SEPARATOR.length);
  expect(subject.split(", ")).toHaveLength(3);
});

test("the shelter page's title is the shelter's name, then its city, then the brand", async ({
  page,
}) => {
  await openRoute(page, "/tvaryny", DETAIL_DESKTOP, { readySelector: CARD });
  const href = await page.locator(CARD).first().getAttribute("href");
  await page.goto(href as string);
  const shelterLink = page.getByRole("link", { name: /^Сторінка притулку «.+»$/ });
  await shelterLink.click();
  await page.waitForURL(/\/prytulky\//);
  // A soft (client-side) navigation's `document.title` update can land a tick after
  // `waitForURL` resolves - waiting for the shelter page's own heading first avoids
  // reading the title mid-transition.
  await page.getByRole("heading", { level: 1 }).waitFor();
  const title = await page.title();
  expect(title.endsWith(EN_DASH_SEPARATOR)).toBe(true);
  const subject = title.slice(0, -EN_DASH_SEPARATOR.length);
  expect(subject.split(", ")).toHaveLength(2);
});
