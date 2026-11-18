import { fillTemplate, uk } from "@opika/i18n";
import type { Metadata } from "next";
import { WORDMARK } from "../brand";
import { REGISTRY_HAS_NO_REAL_SHELTERS } from "../seo-flags";
import { LINK_PREVIEW_DESCRIPTION } from "../seo-text";

/** The root layout's `openGraph` fields: Next replaces a parent's `openGraph` wholesale, so a page repeats them. */
export const OPEN_GRAPH_SITE = { type: "website", siteName: WORDMARK, locale: "uk_UA" } as const;

/** The root layout's `twitter`, repeated for the same reason. */
export const TWITTER_CARD = { card: "summary_large_image" } as const;

/**
 * One title and description for the page, its link preview and its Twitter card (handoff B2).
 * `absolute`: these approved titles carry their own brand, so `TITLE_TEMPLATE` must not add one.
 */
export function seoMetadata(title: string, description: string): Metadata {
  return {
    title: { absolute: title },
    description,
    openGraph: { ...OPEN_GRAPH_SITE, title, description },
    twitter: { ...TWITTER_CARD, title, description },
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

/** `/pro`. */
export const ABOUT_SEO: Metadata = seoMetadata(
  withSite(uk.seo.about.title),
  withSite(uk.seo.about.description),
);
