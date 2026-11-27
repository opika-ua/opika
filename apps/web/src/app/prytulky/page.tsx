import { uk } from "@opika/i18n";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { cache } from "react";
import { kabinetSessionCookiePresent } from "../../features/chrome/kabinet-signed-in";
import { RateLimitedScreen } from "../../features/chrome/RateLimitedScreen";
import { SheltersIndexScreen } from "../../features/shelters/SheltersIndexScreen";
import {
  loadSheltersIndex,
  type SheltersIndexLoad,
} from "../../features/shelters/shelters-index-load";
import { SHELTERS_INDEX_PATH } from "../../features/shelters/shelters-index-path";
import { seoMetadata, withSite } from "../../seo/page-metadata";
import { REGISTRY_HAS_NO_REAL_SHELTERS } from "../../seo-flags";

/** Live listing data, like the gallery: prerendering would bake in a stale list. */
export const dynamic = "force-dynamic";

/** `generateMetadata` and the page both need the load; `cache` shares one per request. */
const loadOnce = cache(() => loadSheltersIndex());

/**
 * The shelters list: the shelters the sitemap names (a listed animal, verified; never an
 * early-listed or paused one), grouped by city. With none, Next's 404, and the sitemap leaves it out.
 */
export default async function Page() {
  const [load, kabinetSignedIn] = await Promise.all([loadOnce(), kabinetSessionCookiePresent()]);
  return renderSheltersIndex(load, kabinetSignedIn);
}

/** The page body for a load result; exported so a test can render each state. */
export function renderSheltersIndex(load: SheltersIndexLoad, kabinetSignedIn: boolean): ReactNode {
  switch (load.kind) {
    case "not_found":
      return notFound();
    case "rate_limited":
      return <RateLimitedScreen />;
    case "index":
      return <SheltersIndexScreen groups={load.groups} kabinetSignedIn={kabinetSignedIn} />;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  return sheltersIndexMetadataOf(await loadOnce());
}

/** Exported so a test can read the metadata of each load result without a database. */
export function sheltersIndexMetadataOf(load: SheltersIndexLoad): Metadata {
  if (load.kind === "rate_limited") return { robots: { index: false, follow: false } };
  if (load.kind !== "index") return {};
  return seoMetadata(
    withSite(uk.sheltersIndex.seoTitle),
    // D-2: no claim about checking shelters over a demo corpus.
    REGISTRY_HAS_NO_REAL_SHELTERS
      ? uk.demo.bannerNotice
      : withSite(uk.sheltersIndex.seoDescription),
    SHELTERS_INDEX_PATH,
  );
}
