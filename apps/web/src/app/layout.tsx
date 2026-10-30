import { uk } from "@opika/i18n";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SITE_ORIGIN, SITE_TITLE, TITLE_TEMPLATE, titled, WORDMARK } from "../brand";
import { SiteAnalytics } from "../features/chrome/SiteAnalytics";
import { SkipLink } from "../features/chrome/SkipLink";
import { PAGE_COLOR } from "../pwa";
import { JsonLd } from "../seo/json-ld";
import { organizationJsonLd } from "../seo/json-ld-builders";
import { REGISTRY_HAS_NO_REAL_SHELTERS, SITE_IS_PUBLICLY_DISCOVERABLE } from "../seo-flags";
import { brandDisplay, brandUi } from "./fonts";

/**
 * Phase T. This was `title: "Adoption Platform"` - a generic English
 * placeholder, and the *default for every route*, so the gallery, the deck and
 * «Для притулків» itself all previewed under it. That mattered the moment
 * `/prytulkam` started telling shelters a card can be sent to Telegram: the
 * page asking a Ukrainian volunteer to trust the project previewed as an
 * unnamed English app.
 *
 * `template` rather than a per-route full string: a route sets its own subject
 * («Тест», «Для притулків») and the product name is appended once, here.
 *
 * No default `openGraph.images` - deliberately, not an oversight. A site-wide
 * OG image is a designed asset that does not exist in this repo, and inventing
 * one would be worse than the link-preview card falling back to title +
 * description. The detail route supplies a real per-animal image
 * (`tvaryny/[animalId]/page.tsx`); a default card for the other routes is a
 * design task, recorded rather than faked.
 *
 * `metadataBase` is set below, to `SITE_ORIGIN` (`brand.ts`) - a fixed literal, never
 * `VERCEL_URL`/`VERCEL_PROJECT_PRODUCTION_URL` (owner, PR B SEO review, 2026-10-26):
 * a canonical URL has to point at the real public domain on every deploy, preview
 * included, not at whatever hostname served the request. Until this PR it was
 * deliberately unset, because nothing here or in the detail route used a relative
 * image URL - the animal photos are absolute R2 CDN URLs - so there was no relative
 * path for Next to resolve. It's needed now because every indexable page sets its
 * own `alternates.canonical` as a relative path, and that *does* need a base to
 * resolve against.
 */
/**
 * D-2: a shared link's preview must not claim verified shelters exist while
 * `REGISTRY_HAS_NO_REAL_SHELTERS`. This is the **default** every route
 * inherits unless it sets its own `description` - `/tvaryny/[animalId]`
 * does (its own per-animal swap); `/prytulkam` and `/pro` do too, overriding
 * with their own existing opening sentences rather than this disclosure
 * (Option B, 2026-09-06, see `docs/observations.md`) - this default was
 * never meant to reach those two specifically, and reaching them was an
 * unconfirmed scope expansion, corrected here.
 */
const linkPreviewDescription = REGISTRY_HAS_NO_REAL_SHELTERS
  ? uk.demo.bannerNotice
  : uk.firstRun.promise;

export const viewport: Viewport = { themeColor: PAGE_COLOR };

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: {
    default: SITE_TITLE,
    template: TITLE_TEMPLATE,
  },
  description: linkPreviewDescription,
  openGraph: {
    type: "website",
    siteName: WORDMARK,
    locale: "uk_UA",
    // `openGraph.title` is never auto-templated by Next (unlike the HTML `<title>`
    // tag), so this is `titled()`, not the bare subject - see brand.ts.
    title: titled(SITE_TITLE),
    description: linkPreviewDescription,
  },
  /**
   * D-3: the noindex signal a crawler can actually see once `app/robots.ts`
   * stops disallowing fetches. `next.config.ts`'s `X-Robots-Tag` header
   * already carries the same flag; this is the HTML-level copy of that same
   * decision, not a second source of truth for it.
   */
  robots: SITE_IS_PUBLICLY_DISCOVERABLE
    ? { index: true, follow: true }
    : { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uk" className={`${brandDisplay.variable} ${brandUi.variable}`}>
      {/*
        The user agent's default 8px body margin is not decoration: combined
        with content-box padding on a full-height page it pushed the deck
        48px past the viewport in both axes (2x8 margin + 2x16 padding), which
        is a scrollbar on a screen that is supposed to be a fixed deck. Found
        against /discovery (E5 migrated the deck to /tvaryny/gortaty; the
        same margin math still applies there). Asserted in
        test/harness/discovery-layout.harness.ts.
      */}
      <body style={{ margin: 0 }}>
        <SkipLink />
        <JsonLd data={organizationJsonLd()} />
        {children}
        {/*
          Cookieless, no-op without JS - aggregate page views (Analytics)
          and real Core Web Vitals from actual devices (Speed Insights),
          which the harness cannot simulate. «Про проєкт» discloses this to
          shelters and adopters. Their one `beforeSend` strips the query string from
          every kabinet sign-in page, so no token reaches either (`SiteAnalytics`).
        */}
        <SiteAnalytics />
      </body>
    </html>
  );
}
