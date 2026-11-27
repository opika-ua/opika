import type { AnimalDetailView } from "@opika/contracts";
import { fillTemplate, forOrganisation, uk } from "@opika/i18n";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { cache } from "react";
import { titled } from "../../../brand";
import { AnimalDetailScreen } from "../../../features/animal-detail/AnimalDetailScreen";
import {
  type AnimalPageLoad,
  loadAnimalPage,
} from "../../../features/animal-detail/animal-page-load";
import { HomeFoundScreen, homeFoundTitle } from "../../../features/animal-detail/HomeFoundScreen";
import { kabinetSessionCookiePresent } from "../../../features/chrome/kabinet-signed-in";
import { RateLimitedScreen } from "../../../features/chrome/RateLimitedScreen";
import { JsonLd } from "../../../seo/json-ld";
import { animalBreadcrumbs } from "../../../seo/json-ld-builders";
import { seoMetadata, withSite } from "../../../seo/page-metadata";
import { REGISTRY_HAS_NO_REAL_SHELTERS, SITE_IS_PUBLICLY_DISCOVERABLE } from "../../../seo-flags";
import {
  animalSeoFacts,
  animalSeoSubject,
  fitTitle,
  truncateDescription,
  withoutTrailingPeriod,
} from "../../../seo-text";

/**
 * Same reasoning as `../page.tsx` and `../../page.tsx`: prerendering at
 * build time would need `DATABASE_URL` as a build-time secret and would
 * bake in a snapshot that goes stale the moment a shelter updates a
 * listing.
 */
export const dynamic = "force-dynamic";

/**
 * F1, `docs/design/README.md`'s addendum frames D1 (1920)/D2 (360) -
 * `AnimalDetailScreen`'s own comment has the rendering detail. The data
 * comes from `loadAnimalPage`, which the gallery's overlay
 * (`../@preview/(.)[animalId]`) also renders from (designer round 1, §2:
 * one component, one loader).
 *
 * Its three outcomes:
 * - `not_found` → `notFound()` (Next's 404, `not-found.tsx` in this
 *   segment): a malformed id, or an animal that doesn't exist, isn't
 *   discoverable or whose shelter isn't verified (`animals.byId` collapses
 *   all three to one `NOT_FOUND`).
 * - `home_found` → the calm «Уже вдома» state (owner, 2026-11-24): an adoption less than 90
 *   days old, 200 and noindex, follow; past 90 days it is `not_found` again.
 * - `rate_limited` → its own screen, his sentence (RL-F1). This used to be
 *   caught with everything else and shown as the 404, «Це не помилка —
 *   просто картки тут більше немає», which was false.
 * - any other error (a database failure) is thrown by the loader and lands
 *   on `/tvaryny/error.tsx`, the boundary the gallery already has. It is
 *   never the not-found copy either.
 */
export default async function Page({ params }: { params: Promise<{ animalId: string }> }) {
  const { animalId } = await params;
  const [load, kabinetSignedIn] = await Promise.all([
    loadAnimalPageOnce(animalId),
    kabinetSessionCookiePresent(),
  ]);
  return renderAnimalPage(load, kabinetSignedIn);
}

/** The page body for a load result; exported so a test can render each state. */
export function renderAnimalPage(load: AnimalPageLoad, kabinetSignedIn: boolean): ReactNode {
  switch (load.kind) {
    case "not_found":
      return notFound();
    case "rate_limited":
      return <RateLimitedScreen />;
    case "home_found":
      return <HomeFoundScreen view={load.view} kabinetSignedIn={kabinetSignedIn} />;
    case "animal":
      return (
        <>
          <JsonLd data={animalBreadcrumbs(uk.feed.galleryTitle, load.view.animal)} />
          <AnimalDetailScreen {...load.view} kabinetSignedIn={kabinetSignedIn} />
        </>
      );
  }
}

/**
 * `cache()` because Next calls `generateMetadata` and the component in the
 * same request and both need the animal. Without it this route would issue
 * two identical sets of queries per view on a `force-dynamic` page; React
 * dedupes them for the lifetime of the request instead.
 */
const loadAnimalPageOnce = cache((animalId: string) => loadAnimalPage(animalId));

/**
 * Phase T, then SEO handoff B2: a shared `/tvaryny/{id}` link previews with the page's own title
 * and description. The preview image is the sibling `opengraph-image.tsx` (1200x630 PNG), which
 * Next wires into og:image and twitter:image.
 *
 * D-2: while the registry holds no real shelters the description is the demo disclosure; an
 * early-listed shelter's animal previews with the «на перевірці» line (N14), never a claim of a
 * verified shelter. The canonical is the animal's own validated id, with no query string.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ animalId: string }>;
}): Promise<Metadata> {
  const { animalId } = await params;
  return animalMetadataOf(await loadAnimalPageOnce(animalId));
}

/** Exported so a test can read the metadata of each load result without a database. */
export function animalMetadataOf(load: AnimalPageLoad): Metadata {
  // A refusal says nothing about the animal; a search engine that met it
  // must not keep it as this URL's page (RL-F1).
  if (load.kind === "rate_limited") return { robots: { index: false, follow: false } };
  // The animal is off the site: not a search result, but its links (header, gallery) are followed.
  if (load.kind === "home_found") {
    return {
      title: { absolute: titled(homeFoundTitle(load.view)) },
      robots: { index: false, follow: true },
    };
  }
  if (load.kind !== "animal") return {};
  const { animal, shelter, cityName } = load.view;
  const listedEarly = shelter.verification === "listed_before_verification";
  const own = animalSeoText(animal, shelter.displayName, cityName);
  const description = REGISTRY_HAS_NO_REAL_SHELTERS
    ? uk.demo.bannerNotice
    : listedEarly
      ? // A link preview must not suggest a verified shelter (N14).
        forOrganisation(uk.underReview.sharePreview, shelter.organisationWord)
      : own.description;
  const seo = seoMetadata(own.title, description, "segment");
  return {
    ...seo,
    openGraph: { ...seo.openGraph, type: "article" },
    // `animal.id`, not the raw param: a UUID in any case would otherwise give a second canonical.
    alternates: { canonical: `/tvaryny/${animal.id}` },
    // Paused, or an early-listed shelter's animal: by link only, whatever the discoverability flag.
    ...((animal.availability.kind === "paused" || listedEarly) && {
      robots: { index: false, follow: SITE_IS_PUBLICLY_DISCOVERABLE },
    }),
  };
}

/**
 * The animal page's title and description, in the effective city (its own, or the shelter's); a
 * city that doesn't resolve takes the owner's no-city pair (2026-11-18). The title drops
 * « – Opika» past 60 characters (`fitTitle`). The description is built from card fields only,
 * never the shelter's story (a story can carry a phone number), under 155 with «…».
 */
export function animalSeoText(
  animal: Pick<AnimalDetailView, "name" | "species" | "sex" | "ageBucket" | "ageSpan" | "size">,
  shelterName: string,
  cityName: string | null,
): { title: string; description: string } {
  const t = uk.seo.animal;
  const values = {
    name: animal.name,
    facts: animalSeoFacts(animal),
    shelter: withoutTrailingPeriod(shelterName),
  };
  const subject = animalSeoSubject(animal, cityName);
  const description =
    cityName === null
      ? fillTemplate(t.descriptionNoCity, values)
      : fillTemplate(t.description, { ...values, city: withoutTrailingPeriod(cityName) });
  return {
    title: fitTitle(withSite(uk.seo.titleWithSite, { title: subject }), subject),
    description: truncateDescription(description),
  };
}
