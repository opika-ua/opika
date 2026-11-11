import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SITE_ORIGIN, SITE_TITLE, TITLE_TEMPLATE, titled, WORDMARK } from "../brand";
import { SiteAnalytics } from "../features/chrome/SiteAnalytics";
import { SkipLink } from "../features/chrome/SkipLink";
import { SAVED_PREPAINT_SCRIPT } from "../features/chrome/saved-prepaint";
import { PAGE_COLOR } from "../pwa";
import { JsonLd } from "../seo/json-ld";
import { organizationJsonLd } from "../seo/json-ld-builders";
import { SITE_IS_PUBLICLY_DISCOVERABLE } from "../seo-flags";
import { LINK_PREVIEW_DESCRIPTION } from "../seo-text";
import { brandDisplay, brandUi } from "./fonts";

/**
 * Phase T. This was `title: "Adoption Platform"` - a generic English
 * placeholder, and the *default for every route*, so the gallery and
 * «Для притулків» itself all previewed under it. That mattered the moment
 * `/prytulkam` started telling shelters a card can be sent to Telegram: the
 * page asking a Ukrainian volunteer to trust the project previewed as an
 * unnamed English app.
 *
 * `template` rather than a per-route full string: a route sets its own subject
 * («Тест», «Для притулків») and the product name is appended once, here.
 *
 * The default preview image is `opengraph-image.tsx` beside this file (wordmark and site title);
 * `/tvaryny/[animalId]` has its own per-animal one.
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
const linkPreviewDescription = LINK_PREVIEW_DESCRIPTION;

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
  twitter: { card: "summary_large_image" },
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
    // `suppressHydrationWarning`: the pre-paint script below sets `data-has-saved` on this element.
    <html
      lang="uk"
      className={`${brandDisplay.variable} ${brandUi.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Before first paint, so the header's saved slot never jumps: see `saved-prepaint.ts`. */}
        <script dangerouslySetInnerHTML={{ __html: SAVED_PREPAINT_SCRIPT }} />
      </head>
      {/* The default 8px body margin plus content-box padding on a full-height page overflows the viewport. */}
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
