/**
 * R3 (Phase R, `docs/build-plan.md`) — the deck's own inline reveal, driven
 * against a real running server and a real seeded database, the same way
 * `animal-detail.harness.ts`'s own "contact reveal" block verifies the
 * detail page's identical dialog. This is the one interaction on the deck
 * that needs JavaScript to work at all beyond the swipe gesture itself
 * (`session.bootstrap` then `animals.reveal`, both real network calls).
 */

import { expect, test } from "@playwright/test";
import { dragHorizontally, expectFocusVisibleOutline, openRoute } from "./harness";
import { PHONE } from "./viewports";

const ROUTE = "/tvaryny/gortaty";
const CARD = "[data-testid='swipe-card']";

/**
 * TEST-NET-2 (198.51.100.0/24), `.32` — next unclaimed address; `.21`
 * through `.31` are already claimed by the other harness files.
 */
test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.32" } });

/** The name on the currently-top card — same helper as `discovery-gesture.harness.ts`. */
async function topCardName(page: import("@playwright/test").Page): Promise<string> {
  const label = await page.getByTestId("swipe-card").getAttribute("aria-label");
  expect(label, "the top card should expose its animal name as aria-label").not.toBeNull();
  return label ?? "";
}

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

  /**
   * Gesture parity (Oleksii, 2026-09-12, in direct answer to "should
   * dragging a card to the right do exactly what «Написати» does, including
   * spending one unit of the reveal budget": yes) — the positive case,
   * driven through a real pointer drag rather than a button click, against a
   * real server. `discovery-gesture.harness.ts` already proves a right-drag
   * advances the deck; this proves it also opens the identical reveal
   * `discovery-reveal.harness.ts`'s own «Написати» test above already
   * verifies in every other respect.
   */
  test("a right-drag past the threshold performs a real reveal, identically to «Написати»", async ({
    page,
  }) => {
    const cardName = await page.getByTestId("swipe-card").getAttribute("aria-label");
    expect(cardName, "the top card should expose its animal name as aria-label").toBeTruthy();

    await dragHorizontally(page, page.getByTestId("swipe-card"), {
      dx: 140,
      steps: 12,
      stepDelayMs: 16,
    });

    const dialog = page.getByTestId("reveal-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("role", "dialog");
    await expect(dialog.getByText(`Ви запитали про ${cardName}.`)).toBeVisible();
    // Real data, not a placeholder.
    await expect(dialog.locator("text=/Притулок/").first()).toBeVisible();
  });

  /**
   * The real-DOM bug a reviewer found in this row's first attempt: guarding
   * the re-entrancy case *inside* `handleCommit` (`onCommit`) could never
   * have worked, because `onCommit` only fires after the drag's own exit
   * animation has already finished and written a real off-screen transform
   * straight to the DOM node — there is nothing left at that point to
   * "cancel." The actual fix (`canCommit`, checked by `useSwipeGesture`
   * before the exit animation ever starts) is what this test drives against
   * a real server and a real, deliberately delayed `animals.reveal`
   * response — the one window in which the bug was reachable at all.
   */
  test("a right-drag while a reveal is already in flight springs back — no second reveal, and the deck does not advance past it", async ({
    page,
  }) => {
    let revealRequests = 0;
    let releaseReveal: () => void = () => {};
    const revealGate = new Promise<void>((resolve) => {
      releaseReveal = resolve;
    });

    await page.route("**/api/rpc/animals/reveal**", async (route) => {
      revealRequests++;
      await revealGate;
      await route.continue();
    });

    const firstCardName = await topCardName(page);

    // Commits the first card — its own `animals.reveal` request is held open
    // by the route handler above until `releaseReveal()` runs, below.
    await dragHorizontally(page, page.getByTestId("swipe-card"), {
      dx: 140,
      steps: 12,
      stepDelayMs: 16,
    });

    // Wait for the deck to actually advance past the first card, proving the
    // exit animation and `onSwipe` already ran — the second card is now the
    // one under the drag below, and the first card's reveal is genuinely
    // in flight (held by the gate) while it happens.
    await expect
      .poll(() => topCardName(page), {
        message: `the deck should have advanced past "${firstCardName}" before the second drag`,
        timeout: 5_000,
      })
      .not.toBe(firstCardName);
    const secondCardName = await topCardName(page);

    // The second card, dragged right while the first card's reveal is still
    // loading. Gesture parity says this would normally reveal it too — but
    // `canCommit` must refuse it, so this has to spring back instead of
    // exiting.
    await dragHorizontally(page, page.getByTestId("swipe-card"), {
      dx: 140,
      steps: 12,
      stepDelayMs: 16,
    });

    // A refused commit takes the exact same path as an under-threshold drag
    // (see `use-swipe-gesture.test.tsx`'s own unit coverage) — give the
    // spring-back's own transition time to settle, then check the deck
    // never advanced past the second card at all.
    await page.waitForTimeout(600);
    expect(
      await topCardName(page),
      "a right-drag refused by canCommit must not advance the deck",
    ).toBe(secondCardName);

    // The actual observable the pre-fix bug got wrong: caught on review, the
    // three checks above (deck didn't advance, one reveal request, dialog
    // names the first card) all pass identically under the pre-fix code too
    // — that version's guard, inside `handleCommit` itself, also blocked
    // `onSwipe` and a second `openReveal` call, just too late to undo the
    // exit animation that had already run. The only observable that
    // actually distinguishes "refused before the exit animation starts"
    // (this fix) from "refused after it already finished" (the bug) is
    // where the card's own transform ends up — centred here, stuck at its
    // exit position there.
    const transform = await page
      .getByTestId("swipe-card")
      .evaluate((el) => (el as HTMLElement).style.transform);
    // A real browser's CSSOM normalises the numeric arguments to px
    // (`translate3d(0px, 0px, 0px)`) — unlike jsdom, which preserves the
    // literal string `useSwipeGesture` assigns
    // (`use-swipe-gesture.test.tsx`'s own equivalent assertion has no units
    // for exactly this reason).
    expect(
      transform,
      "the refused card must spring back to centre, not stay stuck at its exit position — this " +
        "is the one assertion that would have failed against the pre-fix `handleCommit`-only guard",
    ).toBe("translate3d(0px, 0px, 0px) rotate(0deg)");

    releaseReveal();
    const dialog = page.getByTestId("reveal-dialog");
    await expect(dialog).toBeVisible();
    // The dialog names the *first* card — the only reveal that was ever
    // actually allowed to start.
    await expect(dialog.getByText(`Ви запитали про ${firstCardName}.`)).toBeVisible();

    expect(
      revealRequests,
      "exactly one animals.reveal request — a refused second drag must never send one at all",
    ).toBe(1);
  });
});
