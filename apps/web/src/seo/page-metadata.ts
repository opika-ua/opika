import { fillTemplate, uk } from "@opika/i18n";
import type { Metadata } from "next";
import { titled, WORDMARK } from "../brand";
import { REGISTRY_HAS_NO_REAL_SHELTERS } from "../seo-flags";
import { LINK_PREVIEW_DESCRIPTION } from "../seo-text";
import { OG_CONTENT_TYPE, OG_SIZE } from "./og-image-size";

/**
 * `app/opengraph-image.tsx`'s card, named by hand: a page's own `openGraph` replaces the root's
 * wholesale, the file-based image included, so these pages previewed with no image at all.
 */
const SITE_IMAGE = { url: "/opengraph-image", ...OG_SIZE, type: OG_CONTENT_TYPE } as const;

const OPEN_GRAPH_BASE = { type: "website", siteName: WORDMARK, locale: "uk_UA" } as const;
const TWITTER_BASE = { card: "summary_large_image" } as const;

/** The root layout's `openGraph` fields plus the site card, which a page must repeat (above). */
export const OPEN_GRAPH_SITE = { ...OPEN_GRAPH_BASE, images: [SITE_IMAGE] } as const;

/** The root layout's `twitter`, repeated for the same reason. */
export const TWITTER_CARD = { ...TWITTER_BASE, images: [SITE_IMAGE.url] } as const;

/** The site card, or the route segment's own `opengraph-image` file, which Next adds itself (BR-7). */
export type PreviewImage = "site" | "segment";

/**
 * One title and description for the page, its link preview and its Twitter card (handoff B2).
 * `absolute`: these approved titles carry their own brand, so `TITLE_TEMPLATE` must not add one.
 */
export function seoMetadata(
  title: string,
  description: string,
  image: PreviewImage = "site",
): Metadata {
  const site = image === "site";
  return {
    title: { absolute: title },
    description,
    openGraph: { ...(site ? OPEN_GRAPH_SITE : OPEN_GRAPH_BASE), title, description },
    twitter: { ...(site ? TWITTER_CARD : TWITTER_BASE), title, description },
  };
}

/** Fills `{site}` with the brand; the catalogue never types it. */
export function withSite(template: string, values: Readonly<Record<string, string>> = {}): string {
  return fillTemplate(template, { ...values, site: WORDMARK });
}

/** `/tvaryny`. D-2: while the registry holds no real shelters, the preview keeps the demo disclosure. */
export const GALLERY_SEO: Metadata = seoMetadata(
  withSite(uk.seo.gallery.title),
  REGISTRY_HAS_NO_REAL_SHELTERS ? LINK_PREVIEW_DESCRIPTION : uk.seo.gallery.description,
);

/** The privacy policy: its own title through `titled()`, « – Opika». */
export const PRIVACY_SEO: Metadata = seoMetadata(
  titled(uk.privacy.title),
  uk.seo.privacy.description,
);

/** `/pro`. */
export const ABOUT_SEO: Metadata = seoMetadata(
  withSite(uk.seo.about.title),
  withSite(uk.seo.about.description),
);
