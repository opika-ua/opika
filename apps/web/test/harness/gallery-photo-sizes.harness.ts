/**
 * Which image variant the browser actually selects, per surface, per DPR.
 *
 * This exists because of a defect nothing in the toolchain could have caught.
 * H1's real-R2 verification pass found the gallery card's `sizes` declaring
 * `(max-width: 599px) 100vw` for a box that lays out at `100vw - 56px` — page
 * padding plus card padding. An 18% overstatement, invisible in review, no
 * type error, no failing test, no visual symptom. At 2x DPR it pushed 720
 * device px past `card`'s 640w and into `detail`'s 1120w, so every phone
 * downloaded 284KB where 136KB would have done. The only symptom was
 * bandwidth, on the device class `docs/stack-decision.md` names specifically
 * (Ukrainian mobile users on carrier networks).
 *
 * So there are two assertions here, and they fail for different reasons:
 *
 * 1. **The declaration is honest** — the shipped `sizes` resolves, at this
 *    viewport, to the width the photo box actually occupies. This is the root
 *    cause, and it catches drift in *either* direction: overstating reintroduces
 *    the overfetch, understating ships a blurry photo. A layout change that
 *    moves the box without updating `sizes` fails here.
 * 2. **The browser picks the intended variant** — real srcset selection at a
 *    real `deviceScaleFactor`, over the real variant ladder. This is the
 *    consequence, and it is what the H1 report tabulated. It is asserted
 *    separately rather than derived from (1) because the DPR multiply is where
 *    an honest-looking declaration can still cross a tier boundary.
 *
 * Both read the `sizes` string off the shipped element rather than restating
 * it — `docs/standing-constraints.md`: "a test may not compare output against
 * the same constant the code renders."
 *
 * If you are adding an image assertion of your own: read
 * `selectVariantFromSrcset`'s doc comment in `harness.ts` first. It records
 * why `naturalWidth` cannot identify a variant on a `w`-descriptor srcset —
 * a trap that cost this phase a full re-measurement.
 *
 * ## Why this does not assert against real R2 objects
 *
 * The seeded corpus stores `seed-photos/*.jpg` keys, which `isRealPhotoKey`
 * deliberately does not treat as R2 keys, so `image-loader.ts` returns a plain
 * root-relative path with no variant ladder behind it. That is a documented
 * property worth keeping — local dev and this harness run with zero R2
 * credentials. Rather than break it by seeding an `animals/`-prefixed key, the
 * selection assertion drives the real ladder (`IMAGE_VARIANTS`) through the
 * real `sizes` string in the real browser, with locally-fulfilled probe URLs.
 * Every input is real; only the bytes are a stand-in, and the bytes are not
 * what selection depends on.
 */

import { IMAGE_VARIANTS } from "@opika/db/image-pipeline";
import { expect, test } from "@playwright/test";
import { openRoute, rectOf, resolveSizesAttribute, selectVariantFromSrcset } from "./harness";
import {
  DETAIL_DESKTOP,
  GALLERY_DESKTOP_1920,
  GALLERY_PHONE_360,
  GALLERY_TABLET,
  type Viewport,
} from "./viewports";

/**
 * proxy.ts rate-limits per IP across the whole harness run; .21-.29 are
 * claimed by sibling files (see `gallery-layout.harness.ts` for the full
 * reasoning). This file takes .30.
 */
test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.30" } });

const GALLERY_ROUTE = "/tvaryny";
const CARD = "[data-testid='animal-card']";
const CARD_PHOTO = "[data-testid='card-photo']";
const DETAIL_PHOTO = "[data-testid='detail-photo']";

/**
 * Layout rounds, and a `calc()` against a fractional viewport can land a
 * fraction off the measured box. One pixel of slack absorbs that without
 * absorbing a real discrepancy — the defect this file exists for was 56px.
 */
const DECLARATION_TOLERANCE_PX = 1;

/** The variant widths the app really ships, not a copy of them. */
const VARIANT_WIDTHS: Record<string, number> = Object.fromEntries(
  Object.entries(IMAGE_VARIANTS).map(([name, { width }]) => [name, width]),
);

async function sizesAttributeOf(
  page: import("@playwright/test").Page,
  selector: string,
): Promise<string> {
  const attr = await page.locator(`${selector} img`).first().getAttribute("sizes");
  expect(attr, `${selector} img has no sizes attribute — nothing to verify`).not.toBeNull();
  return attr as string;
}

/**
 * The four combinations the H1 report tabulated, plus tablet — which the
 * report did not cover and which is the one breakpoint whose declaration is a
 * fixed px rather than viewport-relative, so it fails differently.
 */
interface Case {
  readonly surface: "gallery" | "detail";
  readonly viewport: Viewport;
  readonly dpr: number;
  readonly expectedVariant: string;
}

const CASES: readonly Case[] = [
  { surface: "gallery", viewport: GALLERY_PHONE_360, dpr: 1, expectedVariant: "card" },
  // The regression guard. Before the fix this selected `detail`.
  { surface: "gallery", viewport: GALLERY_PHONE_360, dpr: 2, expectedVariant: "card" },
  { surface: "gallery", viewport: GALLERY_DESKTOP_1920, dpr: 1, expectedVariant: "card" },
  { surface: "gallery", viewport: GALLERY_TABLET, dpr: 2, expectedVariant: "card" },
  { surface: "detail", viewport: DETAIL_DESKTOP, dpr: 1, expectedVariant: "card" },
];

for (const { surface, viewport, dpr, expectedVariant } of CASES) {
  test.describe(`${surface} photo at ${viewport.name} @${dpr}x`, () => {
    test.use({ deviceScaleFactor: dpr });

    test(`browser selects the "${expectedVariant}" variant`, async ({ page }) => {
      const route = surface === "gallery" ? GALLERY_ROUTE : await firstAnimalHref(page, viewport);
      const photo = surface === "gallery" ? CARD_PHOTO : DETAIL_PHOTO;
      await openRoute(page, route, viewport, { readySelector: photo });

      const sizes = await sizesAttributeOf(page, photo);
      const chosen = await selectVariantFromSrcset(page, sizes, VARIANT_WIDTHS);
      const resolved = await resolveSizesAttribute(page, sizes);

      expect(
        chosen,
        `at ${viewport.width}px @${dpr}x the browser selected "${chosen}", expected ` +
          `"${expectedVariant}".\n` +
          `        sizes="${sizes}"\n` +
          `        matched clause: "${resolved.source}" -> ${resolved.px}px\n` +
          `        needed: ${resolved.px} x ${dpr} = ${resolved.px * dpr} device px\n` +
          `        ladder: ${JSON.stringify(VARIANT_WIDTHS)}\n` +
          `        A wrong variant here is invisible in the UI — the symptom is bandwidth. ` +
          `If "${chosen}" is larger than expected, the sizes clause above overstates the ` +
          `box; if smaller, the photo is now under-resolved and will look soft.`,
      ).toBe(expectedVariant);
    });

    test("the sizes declaration matches the box that is actually laid out", async ({ page }) => {
      const route = surface === "gallery" ? GALLERY_ROUTE : await firstAnimalHref(page, viewport);
      const photo = surface === "gallery" ? CARD_PHOTO : DETAIL_PHOTO;
      await openRoute(page, route, viewport, { readySelector: photo });

      const sizes = await sizesAttributeOf(page, photo);
      const resolved = await resolveSizesAttribute(page, sizes);
      const box = await rectOf(page.locator(photo).first(), `${surface} photo box`);

      expect(
        Math.abs(resolved.px - box.width),
        `sizes declares ${resolved.px}px but the ${surface} photo box measures ` +
          `${box.width.toFixed(2)}px at ${viewport.width}px wide — a ` +
          `${(resolved.px - box.width).toFixed(2)}px discrepancy.\n` +
          `        sizes="${sizes}"\n` +
          `        matched clause: "${resolved.source}"\n` +
          `        Overstating downloads a larger variant than the box needs, for every ` +
          `visitor at this breakpoint, with no visible symptom. Understating ships a ` +
          `blurry photo. Derive the clause from the layout — see AnimalCard.tsx's own ` +
          `comment for the arithmetic.`,
      ).toBeLessThanOrEqual(DECLARATION_TOLERANCE_PX);
    });
  });
}

/**
 * The detail cases need a real seeded animal. Discovered through the gallery
 * rather than hardcoded, the same reasoning `animal-detail.harness.ts` gives:
 * a hardcoded id is a fixture coupling that rots the next time seed data moves.
 */
let cachedHref: string | null = null;
async function firstAnimalHref(
  page: import("@playwright/test").Page,
  viewport: Viewport,
): Promise<string> {
  if (cachedHref !== null) return cachedHref;
  await openRoute(page, GALLERY_ROUTE, viewport, { readySelector: CARD });
  // The card's root element *is* the Link (AnimalCard.tsx) — no inner anchor.
  const href = await page.locator(CARD).first().getAttribute("href");
  expect(
    href,
    "no animal card link found on the gallery — cannot reach a detail page",
  ).toBeTruthy();
  cachedHref = href as string;
  return cachedHref;
}
