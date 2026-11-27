import type { PublicShelterView } from "@opika/contracts";
import {
  type FeedFilters,
  type GallerySort,
  type SpeciesPhrase,
  speciesPhrase,
} from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { cache } from "react";
import { titled } from "../../../brand";
import { kabinetSessionCookiePresent } from "../../../features/chrome/kabinet-signed-in";
import { RateLimitedScreen } from "../../../features/chrome/RateLimitedScreen";
import type { SearchParams } from "../../../features/gallery/filter-url";
import { shownAboutText } from "../../../features/shelters/ShelterAboutSection";
import { ShelterPageScreen } from "../../../features/shelters/ShelterPageScreen";
import {
  loadShelterPage,
  type ShelterPageLoad,
} from "../../../features/shelters/shelter-page-load";
import { parseShelterPageQuery } from "../../../features/shelters/shelter-url";
import { JsonLd } from "../../../seo/json-ld";
import { shelterBreadcrumbs } from "../../../seo/json-ld-builders";
import { seoMetadata, withSite } from "../../../seo/page-metadata";
import { REGISTRY_HAS_NO_REAL_SHELTERS, SITE_IS_PUBLICLY_DISCOVERABLE } from "../../../seo-flags";
import { fitTitle, LINK_PREVIEW_DESCRIPTION, truncateDescription } from "../../../seo-text";

/** Live listing data, like `/tvaryny`: prerendering would bake in a stale snapshot. */
export const dynamic = "force-dynamic";

type Params = Promise<{ shelterId: string }>;

/**
 * The shelter page (designer round 1, S6; DR1-D2: by id). Its outcomes are
 * the animal page's (`tvaryny/[animalId]/page.tsx`):
 * - `not_found` → Next's 404 (`not-found.tsx` here): an unknown or malformed
 *   id, or a shelter that isn't verified (pending, rejected, suspended,
 *   paused), which `shelters.byId` answers alike;
 * - `rate_limited` → its own screen, never the 404 (RL-F1);
 * - any other error reaches the root error boundary.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<SearchParams>;
}) {
  const { shelterId } = await params;
  const [load, kabinetSignedIn] = await Promise.all([
    loadShelterPageOnce(shelterId, await searchParams),
    kabinetSessionCookiePresent(),
  ]);
  return renderShelterPage(load, kabinetSignedIn);
}

/** The page body for a load result; exported so a test can render each state. */
export function renderShelterPage(load: ShelterPageLoad, kabinetSignedIn: boolean): ReactNode {
  switch (load.kind) {
    case "not_found":
      return notFound();
    case "rate_limited":
      return <RateLimitedScreen />;
    case "shelter":
      return (
        <>
          <JsonLd
            data={shelterBreadcrumbs(
              uk.feed.galleryTitle,
              load.view.sheltersIndexListed ? uk.sheltersIndex.footerLink : null,
              load.view.shelter,
            )}
          />
          <ShelterPageScreen {...load.view} kabinetSignedIn={kabinetSignedIn} />
        </>
      );
  }
}

/**
 * `cache()`: Next calls `generateMetadata` and the page in one request, and
 * both need the shelter. Keyed on primitives (the id, the sort and the page),
 * since `cache` compares arguments by identity, so the two calls share one load.
 */
const loadOnce = cache((shelterId: string, sort: GallerySort, page: number, filtersJson: string) =>
  loadShelterPage(shelterId, { sort, page, filters: JSON.parse(filtersJson) as FeedFilters }),
);

function loadShelterPageOnce(shelterId: string, searchParams: SearchParams) {
  const { sort, page, filters } = parseShelterPageQuery(searchParams);
  return loadOnce(shelterId, sort, page, JSON.stringify(filters));
}

/**
 * Handoff B2's title and description (from the species the shelter lists, its city nominative),
 * for the page and its previews alike. Without a city or a listed animal the template cannot be
 * filled, so the brand-suffixed name and the shelter's own text stand in. The canonical is the
 * bare shelter URL whatever the sort, page or filters (owner, PR B).
 */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const { shelterId } = await params;
  return shelterMetadataOf(await loadShelterPageOnce(shelterId, await searchParams));
}

/** Exported so a test can read the metadata of each load result without a database. */
export function shelterMetadataOf(load: ShelterPageLoad): Metadata {
  if (load.kind === "rate_limited") return { robots: { index: false, follow: false } };
  if (load.kind !== "shelter") return {};
  const { shelter, cityName, listedSpecies } = load.view;
  const { title, description } = shelterSeoText(
    shelter.displayName,
    cityName,
    speciesPhrase(listedSpecies),
    shelter.description,
  );
  return {
    // `shelter.id`, not the raw route param: a UUID's schema accepts any case, so an uppercase
    // request would otherwise get a canonical that disagrees with the lowercase links site-wide.
    ...seoMetadata(title, description, `/prytulky/${shelter.id}`),
    // A paused page is reachable by link only: after the discoverability flip it must not be indexed.
    // Paused, or still under review: reachable by link, never indexed (owner, 2026-11-04).
    ...((shelter.availability.kind === "paused" ||
      shelter.verification === "listed_before_verification") && {
      robots: { index: false, follow: SITE_IS_PUBLICLY_DISCOVERABLE },
    }),
  };
}

/** Exported for its table test: the strings `shelterMetadataOf` sets, before the metadata shape. */
export function shelterSeoText(
  shelterName: string,
  cityName: string | null,
  phrase: SpeciesPhrase,
  about: PublicShelterView["description"],
): { title: string; description: string } {
  const subject =
    cityName === null
      ? null
      : fillTemplate(uk.seo.shelter.title, { shelter: shelterName, city: cityName });
  const title =
    subject === null
      ? titled(shelterName)
      : fitTitle(withSite(uk.seo.titleWithSite, { title: subject }), subject);
  if (REGISTRY_HAS_NO_REAL_SHELTERS) return { title, description: uk.demo.bannerNotice };
  if (cityName === null || phrase.kind === "none") {
    const own = shownAboutText(about);
    return {
      title,
      description: own === null ? LINK_PREVIEW_DESCRIPTION : truncateDescription(own),
    };
  }
  const description = fillTemplate(uk.seo.shelter.description, {
    shelter: shelterName,
    city: cityName,
    species: uk.seo.speciesPhrase.lower[phrase.key],
  });
  return { title, description: truncateDescription(description) };
}
