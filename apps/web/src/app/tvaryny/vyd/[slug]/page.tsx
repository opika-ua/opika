import type { AnimalSpecies } from "@opika/domain";
import { uk } from "@opika/i18n";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { anonymousRouterClient } from "../../../../api/server-client";
import { kabinetSessionCookiePresent } from "../../../../features/chrome/kabinet-signed-in";
import type { SearchParams } from "../../../../features/gallery/filter-url";
import { speciesPageHeading, speciesSeoText } from "../../../../features/gallery/species-page-text";
import { speciesOfSlug, speciesPagePath } from "../../../../features/gallery/species-pages";
import { JsonLd } from "../../../../seo/json-ld";
import { speciesBreadcrumbs } from "../../../../seo/json-ld-builders";
import { seoMetadata } from "../../../../seo/page-metadata";
import { type GalleryReads, galleryCanonicalOf, readGallery, renderGallery } from "../../page";

/** Live listing data, like the gallery: prerendering would bake in a stale snapshot. */
export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

/** `generateMetadata` and the page read the same statements once per request. */
const readOnce = cache((species: AnimalSpecies, searchParamsJson: string) =>
  readGallery(anonymousRouterClient(), JSON.parse(searchParamsJson) as SearchParams, { species }),
);

/**
 * A species' landing page (owner, 2026-11-27): the gallery with the species fixed, the other
 * filters available. It exists only while the species has enough indexable animals
 * (`speciesWithPages`); otherwise, and for any other slug, Next's 404.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<SearchParams>;
}) {
  const species = speciesOfSlug((await params).slug);
  if (species === null) notFound();
  const [rawSearchParams, kabinetSignedIn] = await Promise.all([
    searchParams,
    kabinetSessionCookiePresent(),
  ]);
  const reads = await readOnce(species, JSON.stringify(rawSearchParams));
  return renderSpeciesPage(
    anonymousRouterClient(),
    species,
    rawSearchParams,
    kabinetSignedIn,
    reads,
  );
}

/** Exported so a test can render it over a database client; `Page` is the one real caller. */
export async function renderSpeciesPage(
  client: ReturnType<typeof anonymousRouterClient>,
  species: AnimalSpecies,
  rawSearchParams: SearchParams,
  kabinetSignedIn: boolean,
  reads: GalleryReads,
) {
  return (
    <>
      <JsonLd
        data={speciesBreadcrumbs(uk.feed.galleryTitle, {
          name: speciesPageHeading(species),
          path: speciesPagePath(species),
        })}
      />
      {await renderGallery(client, rawSearchParams, kabinetSignedIn, { species }, reads)}
    </>
  );
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const species = speciesOfSlug((await params).slug);
  if (species === null) return {};
  const reads = await readOnce(species, JSON.stringify(await searchParams));
  // A 404 or a 308 sets nothing of its own.
  if (reads.kind !== "reads") return {};
  // The gallery's canonical rule: the bare species page with the page number, or a city page
  // when the query names one city that has one (the city rule first).
  return speciesPageMetadataOf(species, reads.pageNumber, galleryCanonicalOf(reads));
}

/** Exported for its test: the approved title (paged) and description, and the given canonical. */
export function speciesPageMetadataOf(
  species: AnimalSpecies,
  page: number,
  canonical: string,
): Metadata {
  const { title, description } = speciesSeoText(species, page);
  return seoMetadata(title, description, canonical);
}
