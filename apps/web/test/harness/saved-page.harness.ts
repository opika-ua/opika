/**
 * S8, the saved page (`/zberezheni`), in a real browser. Flows only, found
 * by role, label and text (CLAUDE.md, "Test logic, not looks"): saving from
 * the gallery overlay, the saved page showing it after a reload (real
 * `localStorage`, which no component test can exercise), clicking a saved
 * card opening the full animal page — never an overlay, since `/zberezheni`
 * sits outside `/tvaryny`'s intercepting layout — and the batch endpoint's
 * `Cache-Control: no-store`, which only a real network response carries.
 *
 * Its own `x-forwarded-for` (TEST-NET-2 .44), the same reasoning every
 * sibling file gives: `proxy.ts`'s per-IP limiter is shared across the app.
 */

import { expect, test } from "@playwright/test";
import { openRoute } from "./harness";
import { DETAIL_DESKTOP } from "./viewports";

test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.44" } });

const CARD = "[data-testid='animal-card']";
const SAVE_BUTTON = "[data-testid='save-button']";

test.describe("saving an animal, from the gallery, shows up on the saved page", () => {
  test("gallery → card → overlay → save → /zberezheni shows it, as a link to the full page", async ({
    page,
  }) => {
    await openRoute(page, "/tvaryny", DETAIL_DESKTOP, { readySelector: CARD });
    const card = page.locator(CARD).first();
    const name = (await card.getByTestId("card-name").textContent())?.trim() ?? "";
    expect(name.length, "the first card has a name").toBeGreaterThan(0);

    // A soft navigation from the gallery opens the overlay, not the full page.
    await card.click();
    const saveButton = page.locator(SAVE_BUTTON);
    await saveButton.waitFor({ state: "visible" });
    await expect(saveButton).toHaveAttribute("aria-pressed", "false");
    await saveButton.click();
    await expect(saveButton).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    // The overlay's own `AnimalDetailScreen` renders its own `SiteHeader`
    // (and therefore its own `nav-saved`), so the next click is ambiguous
    // until the dialog is actually gone, not merely told to close.
    await page.getByRole("dialog").waitFor({ state: "hidden" });

    // The saved page is linked from the header, on the gallery — a real,
    // full navigation, never the intercepting route (`/zberezheni` sits
    // outside `/tvaryny`, so S4's `(.)[animalId]` cannot match it).
    await page.getByTestId("nav-saved").click();
    await page.waitForURL("**/zberezheni");

    const savedLink = page.getByRole("link", { name: new RegExp(name) });
    await expect(savedLink).toBeVisible();
    expect(await savedLink.getAttribute("href")).toMatch(/^\/tvaryny\/[0-9a-f-]{36}$/);

    // Clicking it opens the real animal page, not an overlay: the URL
    // changes to the animal's own path, and the gallery list (which an
    // overlay would sit on top of, still in the DOM behind it) is gone.
    await savedLink.click();
    await page.waitForURL(/\/tvaryny\/[0-9a-f-]{36}$/);
    expect(page.url()).not.toContain("/zberezheni");
    await expect(page.locator(SAVE_BUTTON)).toHaveAttribute("aria-pressed", "true");
  });

  test("a reload keeps the save — real localStorage, not component state", async ({ page }) => {
    await openRoute(page, "/tvaryny", DETAIL_DESKTOP, { readySelector: CARD });
    await page.locator(CARD).first().click();
    const saveButton = page.locator(SAVE_BUTTON);
    await saveButton.waitFor({ state: "visible" });
    await saveButton.click();
    await expect(saveButton).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });

    await page.getByTestId("nav-saved").click();
    await page.waitForURL("**/zberezheni");
    await expect(page.locator(CARD)).toHaveCount(1);

    await page.reload();
    await expect(page.locator(CARD)).toHaveCount(1);
  });
});

test.describe("the saved page's batch read", () => {
  test("its response carries Cache-Control: no-store", async ({ page }) => {
    await openRoute(page, "/tvaryny", DETAIL_DESKTOP, { readySelector: CARD });
    await page.locator(CARD).first().click();
    await page.locator(SAVE_BUTTON).click();
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });

    const responsePromise = page.waitForResponse((res) =>
      res.url().includes("/api/rpc/animals/cardsByIds"),
    );
    await page.getByTestId("nav-saved").click();
    const response = await responsePromise;

    expect(response.headers()["cache-control"]).toBe("no-store");
  });

  test("the request carries no cookie — credentials: 'omit' (DR1-Q2)", async ({ page }) => {
    await openRoute(page, "/tvaryny", DETAIL_DESKTOP, { readySelector: CARD });
    await page.locator(CARD).first().click();
    await page.locator(SAVE_BUTTON).click();
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });

    const requestPromise = page.waitForRequest((req) =>
      req.url().includes("/api/rpc/animals/cardsByIds"),
    );
    await page.getByTestId("nav-saved").click();
    const request = await requestPromise;

    // `request.headers()` never carries cookies at all (Playwright's own
    // doc comment: "does not return security-related headers, including
    // cookie-related ones"), so asserting on it here would pass whether or
    // not `credentials: "omit"` actually did anything — `allHeaders()` is
    // the one that would show a cookie if the browser had sent it.
    const headers = await request.allHeaders();
    expect(headers.cookie).toBeUndefined();
  });

  /**
   * S8-D1 (Oleksii, 2026-10-23): POST only. oRPC's own codec would happily
   * decode a GET's input from a `?data=` query string instead of the body
   * (`route.ts`'s own comment on `CARDS_BY_IDS_PATH` has the full reasoning)
   * — exactly the ids this endpoint's "never logged" promise exists to
   * protect, sitting in the URL instead. Checked against a real server, not
   * the route module's source, since the method restriction lives in
   * `route.ts`'s shared `handleRequest`, not in the oRPC contract itself.
   */
  test("refuses anything but POST", async ({ request }) => {
    const response = await request.get("/api/rpc/animals/cardsByIds?data=%7B%7D");
    expect(response.status()).toBe(405);
    expect(response.headers().allow).toBe("POST");
  });

  /**
   * S8-D1 (Oleksii, 2026-10-23): exempting this path from the pre-launch
   * gate must not also exempt it from `apiRateLimiter` — the two are
   * independent checks in `route.ts`, but nothing short of actually
   * spending the budget proves the exemption didn't accidentally skip
   * both. Same pattern as `gallery-rate-limit.harness.ts`: a random,
   * unique IP so this test's deliberate exhaustion can never collide with
   * another test's budget, and the `request` API context rather than
   * `page`, since this needs no browser and no gate cookie at all — the
   * whole point of the exemption.
   */
  test("the per-IP rate limit still applies, even though the gate doesn't", async ({ request }) => {
    const testIp = `203.0.113.${Math.floor(Math.random() * 254) + 1}`;
    const BUDGET = 100;
    const body = JSON.stringify({ json: { animalIds: [] } });

    let lastStatus = 0;
    for (let i = 0; i < BUDGET + 1; i++) {
      const response = await request.post("/api/rpc/animals/cardsByIds", {
        headers: { "x-forwarded-for": testIp, "content-type": "application/json" },
        data: body,
      });
      lastStatus = response.status();
      if (i < BUDGET) {
        expect(lastStatus, `request ${i + 1}/${BUDGET} was rate-limited early`).not.toBe(429);
      }
    }

    expect(
      lastStatus,
      `request ${BUDGET + 1} was not rate-limited — the gate exemption may have skipped the rate limiter too`,
    ).toBe(429);
  });
});
