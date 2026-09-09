/**
 * R3 (Phase R, `docs/build-plan.md`) — the deck's own inline reveal, driven
 * against a real running server and a real seeded database, the same way
 * `animal-detail.harness.ts`'s own "contact reveal" block verifies the
 * detail page's identical dialog. This is the one interaction on the deck
 * that needs JavaScript to work at all beyond the swipe gesture itself
 * (`session.bootstrap` then `animals.reveal`, both real network calls).
 */

import { expect, test } from "@playwright/test";
import { expectFocusVisibleOutline, openRoute } from "./harness";
import { PHONE } from "./viewports";

const ROUTE = "/tvaryny/gortaty";
const CARD = "[data-testid='swipe-card']";

/**
 * TEST-NET-2 (198.51.100.0/24), `.32` — next unclaimed address; `.21`
 * through `.31` are already claimed by the other harness files.
 */
test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.32" } });

test.describe(`${ROUTE} inline reveal`, () => {
  test.beforeEach(async ({ page }) => {
    await openRoute(page, ROUTE, PHONE, { readySelector: CARD });
  });

  test("before: the dialog is not present", async ({ page }) => {
    await expect(page.getByTestId("reveal-dialog")).toHaveCount(0);
  });

  test("«Написати» performs a real reveal and shows real shelter contact details, without leaving the deck", async ({
    page,
  }) => {
    const cardName = await page.getByTestId("swipe-card").getAttribute("aria-label");
    expect(cardName, "the top card should expose its animal name as aria-label").toBeTruthy();

    await page.getByRole("button", { name: "Написати" }).click();

    const dialog = page.getByTestId("reveal-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("role", "dialog");
    await expect(dialog).toHaveAttribute("aria-modal", "true");

    // Real data, not a placeholder — the shelter's actual seeded name
    // appears once the reveal resolves.
    await expect(dialog.locator("text=/Притулок/").first()).toBeVisible();

    // Still on the deck route — R3's own requirement, "the deck session
    // must survive a reveal, no exit back to the gallery" — checked as a
    // URL fact, not just an absence of navigation the test forgot to look
    // for.
    expect(page.url()).toContain("/tvaryny/gortaty");

    // The dialog names the animal that was actually on top when «Написати»
    // was activated, transcribed from the design's own template
    // (`uk.reveal.youAskedAbout`), not compared against the constant.
    await expect(dialog.getByText(`Ви запитали про ${cardName}.`)).toBeVisible();

    // Real end-to-end proof that `cityNames` actually reaches the deck's
    // own reveal, not just that the prop compiles: `GortatyPage`'s server
    // component threads a real `cityId -> name` map down to
    // `SwipeDeck.tsx`, which resolves it via `cardCityId`
    // (`../gallery/card-text.ts`). `uk.location.lineAtShelter`'s own
    // template is "м. {city}" — this only ever renders with a real name
    // filled in, never as a bare "м." with nothing after it, which is
    // what a silently-empty `cityNames` lookup would produce instead.
    await expect(dialog.getByText(/^м\. \S/)).toBeVisible();
  });

  test("the deck's dialog has no 'back to gallery' link — only the detail page's does", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Написати" }).click();
    await page.getByTestId("reveal-dialog").waitFor({ state: "visible" });

    await expect(page.getByTestId("reveal-back-to-gallery")).toHaveCount(0);
  });

  test("Escape closes the dialog and leaves the deck itself unaffected", async ({ page }) => {
    await page.getByRole("button", { name: "Написати" }).click();
    await page.getByTestId("reveal-dialog").waitFor({ state: "visible" });

    await page.keyboard.press("Escape");

    await expect(page.getByTestId("reveal-dialog")).toHaveCount(0);
    // Real assertion that the deck itself is still there and interactive,
    // not just that the dialog's own element was removed.
    await expect(page.getByTestId("swipe-card")).toBeVisible();
    await expect(page.getByRole("button", { name: "Написати" })).toBeVisible();
  });

  /**
   * The write button's own outline is already covered by
   * `discovery-layout.harness.ts`'s "keyboard focus" block (R2). This is
   * the dialog's own close control — shared code with the detail page's
   * `RevealFlow.tsx`, but the detail page's harness has never asserted it
   * directly either; worth a real check now that a second surface opens
   * the same component.
   */
  test("the dialog's own close button carries a real focus-visible outline", async ({ page }) => {
    await page.getByRole("button", { name: "Написати" }).click();
    await page.getByTestId("reveal-dialog").waitFor({ state: "visible" });

    await expectFocusVisibleOutline(page, {
      label: "reveal close button",
      locator: page.getByTestId("reveal-close"),
    });
  });

  /**
   * The STOP finding this row exists to close: before `SwipeDeck.tsx`'s
   * reveal shared `use-feed-deck.ts`'s own `ensureSession`, «Написати» on
   * a first-time visitor fired two independent, concurrent, cookie-less
   * `session.bootstrap` calls (one from the swipe recording, one from the
   * reveal) — neither request carried a cookie proving they were the same
   * visitor, so the server minted two adopters and two sessions, and the
   * browser kept only one `Set-Cookie`, silently discarding whichever
   * swipe or reveal landed under the other. A real network trace against
   * a fresh, cookie-less page load is the only way this is actually
   * caught — a mocked client can't reproduce a race between two real,
   * concurrent HTTP requests.
   */
  test("«Написати» on a first-time visitor sets exactly one session cookie, not two", async ({
    page,
  }) => {
    const setCookieValues: string[] = [];
    page.on("response", async (response) => {
      // `response.headers()` folds repeated header names into one
      // comma-joined string, which is exactly wrong for `Set-Cookie`
      // (commas are also legal inside a cookie's own `Expires` attribute).
      // `headersArray()` keeps every header instance separate.
      const headers = await response.headersArray();
      for (const { name, value } of headers) {
        if (name.toLowerCase() === "set-cookie") setCookieValues.push(value);
      }
    });

    await page.getByRole("button", { name: "Написати" }).click();
    await page.getByTestId("reveal-dialog").waitFor({ state: "visible" });

    // Every `__Host-session=...` (prod) or `session=...` (dev) assignment
    // seen across the whole sequence, not just the last one the browser
    // happened to keep — two *different* token values here is exactly the
    // race, even if the browser's own cookie jar only shows one at the end.
    const sessionCookieTokens = new Set(
      setCookieValues
        .map((raw) => /(?:__Host-)?session=([^;]+)/.exec(raw)?.[1])
        .filter((token): token is string => Boolean(token)),
    );

    expect(
      sessionCookieTokens.size,
      `expected exactly one session token to ever be minted for this visitor, saw ` +
        `${sessionCookieTokens.size}: ${[...sessionCookieTokens].join(", ")} — two means two ` +
        `concurrent session.bootstrap calls raced and minted two adopters`,
    ).toBe(1);
  });
});
