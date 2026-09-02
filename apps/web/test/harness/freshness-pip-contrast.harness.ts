/**
 * The empty freshness pip's contrast fix is recorded in
 * `docs/design/README.md`, "The freshness marker": the mock's original solid
 * `#DCDCD9` fill measured 1.16-1.37:1 against every background it appears
 * on, failing WCAG 1.4.11's 3:1 non-text-contrast minimum by a wide margin.
 * The fix is a transparent fill with a 1.5-2px border in `rg-ink-3`
 * (`#63676B`) instead — the design was subsequently updated to specify the
 * outline directly, so this is the current spec, not a standing deviation.
 *
 * A markup or class-name check cannot catch a regression here — the mock is
 * one edit away, and `docs/design/README.md`'s own colour table sits right
 * next to it. This measures the real, browser-computed contrast ratio of the
 * rendered border against its actual background, on every surface the empty
 * pip appears on today (the gallery card and the deck's top card), so a
 * reversion back to a solid fill — or a future recolour that happens to
 * reintroduce a near-`#DCDCD9` value — fails here rather than shipping.
 *
 * Mutation-tested: temporarily reverting the empty-pip branch in
 * `AnimalCard.tsx`/`SwipeCard.tsx` to a solid `bg-rg-fill-strong` fill (the
 * mock's own `#DCDCD9`) makes both assertions below fail with a measured
 * ratio around 1.2-1.4:1 — confirming this test has teeth, not just shape.
 */

import { expect, test } from "@playwright/test";
import { contrastRatio, openRoute } from "./harness";
import { PHONE } from "./viewports";

const EMPTY_PIP = '[data-testid="freshness-pip"][data-filled="false"]';
const MIN_CONTRAST = 3;

/**
 * `198.51.100.25` -- next unused address in the TEST-NET-2 block this
 * harness's other `/tvaryny` files already draw fixed addresses from
 * (.21-.24), isolating this file's own request volume from the shared
 * per-IP budget `proxy.ts` enforces on `/tvaryny`.
 */
test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.25" } });

/**
 * The pip's actual *visible* colour, not an implementation assumption about
 * how it's drawn: a non-transparent fill (the mock's own solid-disc
 * approach) is the foreground; only when the fill is transparent does the
 * border colour carry the contrast instead. A test that only ever read
 * `borderTopColor` would pass vacuously against a solid-fill regression —
 * a filled element has a border colour computed regardless of border-width,
 * so "no border, only a fill" would silently report whatever colour the
 * (invisible, zero-width) border defaults to rather than catching the fill.
 */
async function emptyPipContrastPairs(
  page: import("@playwright/test").Page,
): Promise<Array<{ foreground: string; background: string }>> {
  return page.$$eval(EMPTY_PIP, (pips) =>
    pips.map((pip) => {
      const style = getComputedStyle(pip);
      const ownFill = style.backgroundColor;
      const fillIsTransparent =
        !ownFill || ownFill === "rgba(0, 0, 0, 0)" || ownFill === "transparent";
      const foreground = fillIsTransparent ? style.borderTopColor : ownFill;

      let node: Element | null = pip.parentElement;
      let background = "";
      while (node) {
        const bg = getComputedStyle(node).backgroundColor;
        if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
          background = bg;
          break;
        }
        node = node.parentElement;
      }
      return { foreground, background };
    }),
  );
}

test.describe("freshness marker — empty pip contrast", () => {
  test("/tvaryny: every empty pip clears 3:1 against its card background", async ({ page }) => {
    await openRoute(page, "/tvaryny", PHONE, { readySelector: '[data-testid="animal-card"]' });

    const pairs = await emptyPipContrastPairs(page);
    expect(
      pairs.length,
      "expected at least one empty (unfilled) freshness pip among the seeded gallery's " +
        "fresh/aging animals — the seeded distribution is 50% fresh / 30% aging / 20% stale " +
        "(packages/db/src/seed.ts), so a full page should always contain some",
    ).toBeGreaterThan(0);

    for (const { foreground, background } of pairs) {
      const ratio = contrastRatio(foreground, background);
      expect(
        ratio,
        `empty pip colour ${foreground} against card background ${background} measured ` +
          `${ratio.toFixed(2)}:1 — WCAG 1.4.11 requires >=${MIN_CONTRAST}:1 for a non-text ` +
          `graphic that conveys required information. This is the exact fix ` +
          `docs/design/README.md's "The freshness marker" records; a border ` +
          `colour or background change that erodes this ratio regresses that decision.`,
      ).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });

  test("/tvaryny/gortaty: the top card's empty pips clear 3:1 against the deck card background", async ({
    page,
  }) => {
    // E5: migrated from /discovery (retired, now a redirect) to
    // /tvaryny/gortaty — the deck's real route on real feed.list data.
    await openRoute(page, "/tvaryny/gortaty", PHONE, {
      readySelector: '[data-testid="swipe-card"]',
    });

    const pairs = await emptyPipContrastPairs(page);
    expect(
      pairs.length,
      "expected the deck's first-served card to have at least one empty pip — feed.list's " +
        "own repo query orders the whole feed by lastUpdatedAt DESC before scoreAnimal " +
        "re-ranks within the fetched page (apps/web/src/api/handlers/feed.ts), so the most " +
        "recently updated seeded animal is always among the first served, and 'fresh' is " +
        "2 of 3 pips empty — an anonymous session's first real card should always contain " +
        "some",
    ).toBeGreaterThan(0);

    for (const { foreground, background } of pairs) {
      const ratio = contrastRatio(foreground, background);
      expect(
        ratio,
        `empty pip colour ${foreground} against deck card background ${background} measured ` +
          `${ratio.toFixed(2)}:1 — WCAG 1.4.11 requires >=${MIN_CONTRAST}:1. Same fix as ` +
          `the gallery card above; the deck reuses the same @opika/ui freshnessPips values.`,
      ).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });
});
