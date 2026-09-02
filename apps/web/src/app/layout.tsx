import { uk } from "@opika/i18n";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata } from "next";
import "./globals.css";
import { commissioner, eUkraine, literata } from "./fonts";

/**
 * Phase T. This was `title: "Adoption Platform"` — a generic English
 * placeholder, and the *default for every route*, so the gallery, the deck and
 * «Для притулків» itself all previewed under it. That mattered the moment
 * `/prytulkam` started telling shelters a card can be sent to Telegram: the
 * page asking a Ukrainian volunteer to trust the project previewed as an
 * unnamed English app.
 *
 * `template` rather than a per-route full string: a route sets its own subject
 * («Тест», «Для притулків») and the product name is appended once, here.
 *
 * No default `openGraph.images` — deliberately, not an oversight. A site-wide
 * OG image is a designed asset that does not exist in this repo, and inventing
 * one would be worse than the link-preview card falling back to title +
 * description. The detail route supplies a real per-animal image
 * (`tvaryny/[animalId]/page.tsx`); a default card for the other routes is a
 * design task, recorded rather than faked.
 *
 * `metadataBase` is deliberately unset too: nothing here or in the detail route
 * uses a relative image URL — the animal photos are absolute R2 CDN URLs — so
 * there is no relative path for Next to resolve, and setting a base to
 * `VERCEL_URL` would point link previews at a deployment hostname rather than
 * the real domain.
 */
export const metadata: Metadata = {
  title: {
    default: "Opika — тварини з притулків Київщини",
    template: "%s — Opika",
  },
  description: uk.firstRun.promise,
  openGraph: {
    type: "website",
    siteName: "Opika",
    locale: "uk_UA",
    title: "Opika — тварини з притулків Київщини",
    description: uk.firstRun.promise,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="uk"
      className={`${literata.variable} ${commissioner.variable} ${eUkraine.variable}`}
    >
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
        {children}
        {/*
          Cookieless, no-op without JS — aggregate page views (Analytics)
          and real Core Web Vitals from actual devices (Speed Insights),
          which the harness cannot simulate. Both free on Vercel's Hobby
          tier. «Про проєкт» discloses this to shelters and adopters.
        */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
