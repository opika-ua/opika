import { fillTemplate, uk } from "@opika/i18n";
import type { Metadata } from "next";
import { titled, WORDMARK } from "../brand";
import { PRIVACY_PATH } from "../features/chrome/privacy-path";
import { REGISTRY_HAS_NO_REAL_SHELTERS } from "../seo-flags";
import { fitTitle, LINK_PREVIEW_DESCRIPTION } from "../seo-text";
import { absoluteUrl } from "./json-ld-builders";
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
 * `canonical` is the one source of both `<link rel="canonical">` and `og:url` (made absolute here),
 * so a page cannot name one without the other.
 */
export function seoMetadata(
  title: string,
  description: string,
  canonical: string,
  image: PreviewImage = "site",
): Metadata {
  const site = image === "site";
  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    openGraph: {
      ...(site ? OPEN_GRAPH_SITE : OPEN_GRAPH_BASE),
      title,
      description,
      url: absoluteUrl(canonical),
    },
    twitter: { ...(site ? TWITTER_CARD : TWITTER_BASE), title, description },
  };
}

/** Fills `{site}` with the brand; the catalogue never types it. */
export function withSite(template: string, values: Readonly<Record<string, string>> = {}): string {
  return fillTemplate(template, { ...values, site: WORDMARK });
}

/**
 * A paged list's title: «… – сторінка 2» goes before the site name, which `fitTitle` still drops
 * first when the whole is over 60 characters. Page 1 has no suffix.
 */
export function pagedTitle(subject: string, page: number): string {
  const paged =
    page > 1 ? fillTemplate(uk.seo.pageSuffix, { title: subject, page: String(page) }) : subject;
  return fitTitle(withSite(uk.seo.titleWithSite, { title: paged }), paged);
}

/** The gallery (`/`) at a page. D-2: while the registry holds no real shelters, the preview keeps the demo disclosure. */
export function gallerySeo(page: number, canonical: string): Metadata {
  return seoMetadata(
    pagedTitle(uk.seo.gallery.title, page),
    REGISTRY_HAS_NO_REAL_SHELTERS ? LINK_PREVIEW_DESCRIPTION : uk.seo.gallery.description,
    canonical,
  );
}

/** The privacy policy: its own title through `titled()`, « – Opika». */
export const PRIVACY_SEO: Metadata = seoMetadata(
  titled(uk.privacy.title),
  uk.seo.privacy.description,
  PRIVACY_PATH,
);

/** `/pro`. */
export const ABOUT_SEO: Metadata = seoMetadata(
  withSite(uk.seo.about.title),
  withSite(uk.seo.about.description),
  "/pro",
);
