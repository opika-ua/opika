import { type GallerySort, textIn } from "@opika/domain";
import { uk } from "@opika/i18n";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { cache } from "react";
import { kabinetSessionCookiePresent } from "../../../features/chrome/kabinet-signed-in";
import { RateLimitedScreen } from "../../../features/chrome/RateLimitedScreen";
import type { SearchParams } from "../../../features/gallery/filter-url";
import { ShelterPageScreen } from "../../../features/shelters/ShelterPageScreen";
import {
  loadShelterPage,
  type ShelterPageLoad,
} from "../../../features/shelters/shelter-page-load";
import { parseShelterPageQuery } from "../../../features/shelters/shelter-url";
import { REGISTRY_HAS_NO_REAL_SHELTERS } from "../../../seo-flags";

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
      return <ShelterPageScreen {...load.view} kabinetSignedIn={kabinetSignedIn} />;
  }
}

/**
 * `cache()`: Next calls `generateMetadata` and the page in one request, and
 * both need the shelter. Keyed on primitives (the id, the sort and the page),
 * since `cache` compares arguments by identity, so the two calls share one load.
 */
const loadOnce = cache((shelterId: string, sort: GallerySort, page: number) =>
  loadShelterPage(shelterId, { sort, page }),
);

function loadShelterPageOnce(shelterId: string, searchParams: SearchParams) {
  const { sort, page } = parseShelterPageQuery(searchParams);
  return loadOnce(shelterId, sort, page);
}

/**
 * The title is the shelter's name alone (his answer, §11 item 4). No
 * `robots` of its own: the root layout's, set by `SITE_IS_PUBLICLY_DISCOVERABLE`,
 * applies here as everywhere (with `next.config.ts`'s header), except that a
 * rate-limited answer is never indexed as this URL's page (RL-F1). The
 * description is the D-2 demo disclosure while the registry holds no real
 * shelters, as on the animal page, and the shelter's own description after.
 */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const { shelterId } = await params;
  const load = await loadShelterPageOnce(shelterId, await searchParams);
  if (load.kind === "rate_limited") return { robots: { index: false, follow: false } };
  if (load.kind !== "shelter") return {};
  const { shelter } = load.view;
  const description = REGISTRY_HAS_NO_REAL_SHELTERS
    ? uk.demo.bannerNotice
    : textIn(shelter.description, "uk");
  return {
    title: shelter.displayName,
    description,
    openGraph: { type: "website", title: shelter.displayName, description },
  };
}
