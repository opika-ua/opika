import { type SpeciesPhrase, speciesPhrase } from "@opika/domain";
import { fillTemplate, placeName, uk } from "@opika/i18n";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { anonymousRouterClient } from "../../../../api/server-client";
import { titled } from "../../../../brand";
import { kabinetSessionCookiePresent } from "../../../../features/chrome/kabinet-signed-in";
import { RateLimitedScreen } from "../../../../features/chrome/RateLimitedScreen";
import { type CityPageLoad, loadCityPage } from "../../../../features/gallery/city-page-load";
import {
  cityPageCanonicalPath,
  cityPagePath,
  NO_PLACE_IDS,
  parseGalleryQuery,
  type SearchParams,
  withQuery,
} from "../../../../features/gallery/filter-url";
import { seoMetadata, withSite } from "../../../../seo/page-metadata";
import { REGISTRY_HAS_NO_REAL_SHELTERS } from "../../../../seo-flags";
import { fitTitle, LINK_PREVIEW_DESCRIPTION, truncateDescription } from "../../../../seo-text";
import { renderGallery } from "../../page";

/** Live listing data, like `/tvaryny`: prerendering would bake in a stale snapshot. */
export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

/** `generateMetadata` and the page both need the load; `cache` shares one per request. */
const loadOnce = cache((slug: string) => loadCityPage(slug));

/**
 * A city's landing page (SEO B3): the gallery filtered to the city, other filters available. It
 * exists only while the city has a listed animal of an indexable shelter; otherwise Next's 404.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<SearchParams>;
}) {
  const { slug } = await params;
  const [load, rawSearchParams, kabinetSignedIn] = await Promise.all([
    loadOnce(slug),
    searchParams,
    kabinetSessionCookiePresent(),
  ]);
  switch (load.kind) {
    case "not_found":
      return notFound();
    case "rate_limited":
      return <RateLimitedScreen />;
    case "moved":
      // The former slug's 308 keeps the visitor's filters, sort and page.
      return permanentRedirect(withQuery(cityPagePath(load.slug), rawSearchParams));
    case "city":
      return renderGallery(anonymousRouterClient(), rawSearchParams, kabinetSignedIn, {
        city: load.city,
      });
  }
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const [load, rawSearchParams] = await Promise.all([loadOnce(slug), searchParams]);
  return cityPageMetadataOf(load, parseGalleryQuery(rawSearchParams, NO_PLACE_IDS).page);
}

/** Exported so a test can read the metadata of each load result without a database. */
export function cityPageMetadataOf(load: CityPageLoad, page: number): Metadata {
  if (load.kind === "rate_limited") return { robots: { index: false, follow: false } };
  if (load.kind !== "city") return {};
  const { title, description } = citySeoText(placeName(load.city), speciesPhrase(load.species));
  return {
    ...seoMetadata(title, description),
    alternates: { canonical: cityPageCanonicalPath(load.city.slug, page) },
  };
}

/** Exported for its table test: handoff B2's city row, before the metadata shape. */
export function citySeoText(
  cityName: string,
  phrase: SpeciesPhrase,
): { title: string; description: string } {
  // A page exists only with a listed animal, so `none` cannot reach here; the heading stands in.
  if (phrase.kind === "none") {
    return {
      title: titled(fillTemplate(uk.cityPage.heading, { city: cityName })),
      description: LINK_PREVIEW_DESCRIPTION,
    };
  }
  const species = uk.seo.speciesPhrase.capitalised[phrase.key];
  const subject = fillTemplate(uk.seo.city.title, { species, city: cityName });
  const title = fitTitle(withSite(uk.seo.titleWithSite, { title: subject }), subject);
  if (REGISTRY_HAS_NO_REAL_SHELTERS) return { title, description: uk.demo.bannerNotice };
  const description = fillTemplate(uk.seo.city.description, { species, city: cityName });
  return { title, description: truncateDescription(description) };
}
