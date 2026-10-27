/**
 * Designer round 1, S4b: the gallery's animal overlay (§2 of
 * `docs/designer-round-1.md`, Oleksii's 2026-10-21 decision: "the gallery
 * opens the same AnimalDetailScreen in an overlay"), in a real browser.
 * Flows only, found by role, label and text (CLAUDE.md, "Test logic, not
 * looks"): what opens, what closes it, where focus and the URL end up, the
 * contact reveal stacked over it, and that every way of reaching
 * `/tvaryny/{id}` other than a click from the gallery still gets the full
 * page.
 *
 * Its own `x-forwarded-for` addresses (TEST-NET-2, .43 to .47), for the
 * same reason as its siblings: proxy.ts's limiter is per IP. One per group
 * of tests, because one gallery load is about ten limited requests (the page
 * and the header's prefetches), and ten tests' worth on one address ran into
 * 429s within the minute.
 */

import { uk } from "@opika/i18n";
import { expect, type Page, type Request, test } from "@playwright/test";
import { openRoute } from "./harness";
import { DETAIL_DESKTOP, DETAIL_PHONE } from "./viewports";

const ipHeaders = (lastOctet: number) => ({ "x-forwarded-for": `198.51.100.${lastOctet}` });

/** Page 2, so "back" has a query string to restore, not just the bare path. */
const GALLERY_PAGE_2 = "/tvaryny?stor=2";
const CARD = "[data-testid='animal-card']";

async function openGallery(page: Page, viewport = DETAIL_DESKTOP) {
  await openRoute(page, GALLERY_PAGE_2, viewport, { readySelector: CARD });
}

/** The nth card's href and the name it shows, read before it is clicked. */
async function cardAt(page: Page, index: number) {
  const card = page.locator(CARD).nth(index);
  const href = await card.getAttribute("href");
  const name = (await card.getByTestId("card-name").textContent())?.trim() ?? "";
  expect(href, "a gallery card links to its animal").toMatch(/^\/tvaryny\/[0-9a-f-]{36}$/);
  expect(name.length, "a gallery card shows its animal's name").toBeGreaterThan(0);
  return { card, href: href as string, name };
}

/**
 * Watches the requests that start from now on, to wait until they have
 * settled: none of them in flight, and nothing new started across two
 * rendered frames. A settled state, not a timeout. Started before the action
 * it watches, so every request that action causes is seen from its start.
 * Requests that were already in flight when it started are not its business:
 * it tracks `Request` objects, so their finish is ignored rather than counted
 * against the ones it did see.
 */
function watchNetwork(page: Page) {
  const inFlight = new Set<Request>();
  let started = 0;
  const onStart = (request: Request) => {
    started += 1;
    inFlight.add(request);
  };
  const onEnd = (request: Request) => {
    inFlight.delete(request);
  };
  page.on("request", onStart);
  page.on("requestfinished", onEnd);
  page.on("requestfailed", onEnd);

  async function untilSettled() {
    try {
      for (let round = 0; round < 50; round += 1) {
        await expect
          .poll(() => [...inFlight].map((request) => request.url()), {
            message: "requests still in flight",
          })
          .toEqual([]);
        const startedBefore = started;
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
            ),
        );
        if (started === startedBefore && inFlight.size === 0) return;
      }
      throw new Error("the network never settled after opening the overlay");
    } finally {
      page.off("request", onStart);
      page.off("requestfinished", onEnd);
      page.off("requestfailed", onEnd);
    }
  }

  return { untilSettled };
}

async function openOverlayFrom(page: Page, index = 0) {
  const target = await cardAt(page, index);
  await target.card.click();
  const dialog = page.getByRole("dialog", { name: target.name });
  await expect(dialog).toBeVisible();
  return { ...target, dialog };
}

test.describe("the gallery's animal overlay", () => {
  test.describe(() => {
    test.use({ extraHTTPHeaders: ipHeaders(43) });

    test("a click on a card opens the animal page in a dialog named after the animal, at its own URL, over the list", async ({
      page,
    }) => {
      await openGallery(page);
      const { href, name, dialog } = await openOverlayFrom(page);

      expect(new URL(page.url()).pathname).toBe(href);
      // The list is still there behind it: same page of the gallery, no
      // document load.
      await expect(page.locator(CARD).first()).toBeAttached();

      // What the animal page shows, because it is the animal page (his Q1).
      await expect(dialog.getByRole("heading", { level: 1, name })).toBeVisible();
      await expect(dialog.getByRole("button", { name: uk.detail.giveHome })).toBeVisible();
      await expect(dialog.getByText(/^Оновлено /)).toBeVisible();
      // «Медичний стан» (pet card PR 5, A3) only renders a column when the shelter has
      // written a free-text note - no seeded animal has one yet (the field is new, no
      // backfill), so «Про мене» (always rendered) is the stand-in for "this is really
      // the animal page" here.
      await expect(dialog.getByText(uk.detail.aboutMeHeading)).toBeVisible();
      // His Q2: no «Відкрити повну сторінку», the overlay is the page.
      await expect(dialog.getByText("Відкрити повну сторінку")).toHaveCount(0);
    });

    /**
     * Pet card PR 5, decision B: the overlay's own prev/next links are
     * deliberately prefetched (`AnimalOverlay.tsx`'s own comment on
     * `NeighbourLink` - the one `/tvaryny` link in this codebase that is,
     * unlike every other gallery/animal link's `prefetch={false}`), so
     * opening a card now charges the opened animal's own path plus up to
     * two more - its neighbours. What this test still guards: no
     * *unbounded* or *gallery* re-fetch - every charged path is either the
     * opened animal or a real `/tvaryny/{uuid}` neighbour, never a second
     * `/tvaryny` gallery-list fetch or more than two distinct neighbours.
     */
    test("opening a card charges only itself and its own neighbours - never a re-prefetch of the gallery", async ({
      page,
    }) => {
      await openGallery(page);
      // Every request proxy.ts charges to the per-IP limit: the page routes
      // under /tvaryny, documents and client fetches alike.
      const charged: string[] = [];
      page.on("request", (request) => {
        const { pathname, search } = new URL(request.url());
        if (pathname === "/tvaryny" || pathname.startsWith("/tvaryny/")) {
          charged.push(pathname + search);
        }
      });

      const network = watchNetwork(page);
      const { href } = await openOverlayFrom(page);
      // Prefetches start when the new tree commits and the links are seen
      // again. Wait for the network to settle rather than for a time.
      await network.untilSettled();

      const distinctPaths = [...new Set(charged.map((url) => url.split("?")[0]))];
      expect(distinctPaths, "the opened animal's own path is always charged").toContain(href);
      const neighbours = distinctPaths.filter((path) => path !== href);
      expect(neighbours.length, "at most the prev and next neighbours").toBeLessThanOrEqual(2);
      for (const path of neighbours) {
        expect(path, `"${path}" should be a real animal path, not a gallery re-fetch`).toMatch(
          /^\/tvaryny\/[0-9a-f-]{36}$/,
        );
      }
    });

    test("opening a card further down keeps the list where it was", async ({ page }) => {
      await openGallery(page, DETAIL_PHONE);
      const card = page.locator(CARD).nth(5);
      await card.scrollIntoViewIfNeeded();
      const before = await page.evaluate(() => window.scrollY);
      expect(before, "the sixth card on a phone is below the first screen").toBeGreaterThan(0);

      await openOverlayFrom(page, 5);
      expect(
        await page.evaluate(() => window.scrollY),
        "the list behind the open overlay is where it was",
      ).toBe(before);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect(await page.evaluate(() => window.scrollY)).toBe(before);
    });
  });

  test.describe(() => {
    test.use({ extraHTTPHeaders: ipHeaders(44) });

    test("Escape closes it, returns to the same gallery URL and gives focus back to the card", async ({
      page,
    }) => {
      await openGallery(page);
      const { href } = await openOverlayFrom(page, 2);

      await page.keyboard.press("Escape");

      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(GALLERY_PAGE_2);
      await expect(page.locator(`a[href="${href}"]`)).toBeFocused();
    });

    test("the close button closes it and gives focus back to the card", async ({ page }) => {
      await openGallery(page);
      const { href, dialog } = await openOverlayFrom(page, 1);

      await dialog.getByRole("button", { name: uk.preview.close }).click();

      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect(new URL(page.url()).search).toBe("?stor=2");
      await expect(page.locator(`a[href="${href}"]`)).toBeFocused();
    });

    test("the browser's back closes it and leaves the gallery page as it was", async ({ page }) => {
      await openGallery(page);
      await openOverlayFrom(page);

      await page.goBack();

      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(GALLERY_PAGE_2);
      await expect(page.locator(CARD).first()).toBeVisible();
    });
  });

  test.describe(() => {
    test.use({ extraHTTPHeaders: ipHeaders(45) });

    test("Tab and Shift+Tab stay inside the overlay", async ({ page }) => {
      await openGallery(page);
      const { dialog } = await openOverlayFrom(page);
      await expect(dialog).toBeFocused();

      for (let i = 0; i < 12; i += 1) {
        await page.keyboard.press("Tab");
        expect(
          await dialog.evaluate((node) => node.contains(document.activeElement)),
          `focus left the overlay after ${i + 1} Tab presses`,
        ).toBe(true);
      }
      for (let i = 0; i < 12; i += 1) {
        await page.keyboard.press("Shift+Tab");
        expect(
          await dialog.evaluate((node) => node.contains(document.activeElement)),
          `focus left the overlay after ${i + 1} Shift+Tab presses`,
        ).toBe(true);
      }
    });

    /**
     * Pet card PR 5, owner decision B: "prev/next navigate between
     * intercepted overlay routes (soft navigation with `router.replace`),
     * so the next animal opens in the same overlay without a full page."
     * `openGallery` here opens page 2 (`GALLERY_PAGE_2`), whose first card
     * is not the gallery's own first animal - it has both neighbours, so
     * this only asserts «Наступний» works, not an end-of-list case (that's
     * a domain-level concern, already covered by the repository's own
     * `animals.neighbours` tests - `null` at a real end).
     */
    test("«Наступний» opens the next animal in the same overlay, no full-page navigation", async ({
      page,
    }) => {
      await openGallery(page);
      const { name: openedName } = await openOverlayFrom(page);

      // The label's own visible text is always «Наступний» (the design's literal word,
      // not the neighbour's name - that's in its aria-label only), so the neighbour is
      // identified by the dialog's name *changing*, not by reading it off the link.
      await page.getByTestId("overlay-next").click();

      const newDialog = page.getByRole("dialog");
      // Polls (not a fixed wait): the soft navigation briefly leaves the old dialog's
      // aria-label in place until React commits the new one, same "settle on a real
      // state, not the clock" discipline this repo's harness timing already follows.
      await expect(
        newDialog,
        "opened a different animal, not the same one again",
      ).not.toHaveAttribute("aria-label", openedName);
      // Still the overlay, not a full page: the list stays attached behind it.
      await expect(page.locator(CARD).first()).toBeAttached();
      expect(new URL(page.url()).pathname).not.toBe(GALLERY_PAGE_2.split("?")[0]);
    });

    test("a reload of the overlay's URL renders the full page, with no overlay", async ({
      page,
    }) => {
      await openGallery(page);
      const { href, name } = await openOverlayFrom(page);

      await page.reload({ waitUntil: "load" });

      await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect(new URL(page.url()).pathname).toBe(href);
    });
  });

  test.describe(() => {
    test.use({ extraHTTPHeaders: ipHeaders(46) });

    // "the deck's entry link still reaches the deck, not an overlay" used
    // to live here - removed, not rewritten: the deck entry link is gone
    // from the gallery page entirely (Oleksii, mid-build: "let's hide
    // access to Гортати по одній page for now as well"), so there is no
    // link left for this test to click. The deck route and its own
    // interception-avoidance logic (`DeckEntryLink.tsx`'s plain-`<a>`
    // reasoning) are untouched; only this page's link to it is gone.

    test("with JavaScript disabled, a card is a plain link to the full page", async ({
      browser,
    }) => {
      const context = await browser.newContext({
        javaScriptEnabled: false,
        extraHTTPHeaders: ipHeaders(46),
      });
      const page = await context.newPage();
      try {
        await openGallery(page);
        const { card, href, name } = await cardAt(page, 0);

        await card.click();

        await page.waitForURL((url) => url.pathname === href);
        await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
        await expect(page.getByRole("dialog")).toHaveCount(0);
      } finally {
        await context.close();
      }
    });
  });
  test.describe("with the contact reveal open over it", () => {
    test.use({ extraHTTPHeaders: ipHeaders(47) });

    /** Opens the reveal from inside the overlay and waits for its dialog. */
    async function openRevealIn(page: Page, overlay: ReturnType<Page["getByRole"]>) {
      await overlay.getByRole("button", { name: uk.detail.giveHome }).click();
      await expect(page.getByTestId("reveal-dialog")).toBeVisible();
    }

    test("the first Escape closes only the reveal, focus on «Дати сімʼю»; the second closes the overlay, focus on the card", async ({
      page,
    }) => {
      await openGallery(page);
      const { href, dialog } = await openOverlayFrom(page, 1);
      await openRevealIn(page, dialog);

      await page.keyboard.press("Escape");
      await expect(page.getByTestId("reveal-dialog")).toHaveCount(0);
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("button", { name: uk.detail.giveHome })).toBeFocused();
      expect(new URL(page.url()).pathname).toBe(href);

      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect(new URL(page.url()).search).toBe("?stor=2");
      await expect(page.locator(`a[href="${href}"]`)).toBeFocused();
    });

    test("back closes the reveal and the overlay together: the list where it was, focus on the card, the page scrolls", async ({
      page,
    }) => {
      await openGallery(page);
      const { href, dialog } = await openOverlayFrom(page, 2);
      await openRevealIn(page, dialog);

      await page.goBack();

      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.getByTestId("reveal-dialog")).toHaveCount(0);
      expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(GALLERY_PAGE_2);
      await expect(page.locator(`a[href="${href}"]`)).toBeFocused();
      // A presence check of the lock, not a measurement: no dialog holds it.
      expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
    });

    test("opening the reveal from the overlay makes exactly one `animals.reveal` request", async ({
      page,
    }) => {
      await openGallery(page);
      const reveals: string[] = [];
      page.on("request", (request) => {
        if (new URL(request.url()).pathname.endsWith("/api/rpc/animals/reveal")) {
          reveals.push(request.method());
        }
      });
      const { dialog } = await openOverlayFrom(page);
      const network = watchNetwork(page);
      await openRevealIn(page, dialog);
      await network.untilSettled();

      expect(reveals).toEqual(["POST"]);
      // The reveal answered (the per-day limit counted it like the page's):
      // the contact, not a refusal.
      await expect(
        page.getByTestId("reveal-dialog").getByText("Ось як звʼязатися з притулком."),
      ).toBeVisible();
    });
  });
});
