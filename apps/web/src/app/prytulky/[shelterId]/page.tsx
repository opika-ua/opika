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
import { META_DESCRIPTION_MAX_LENGTH, trimAtWordBoundary } from "../../../seo-text";

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
 * The title is `{shelterName}, {city}` (owner, PR B, the SEO review of page titles;
 * `cityName` omitted when it doesn't resolve). No `robots` of its own: the root
 * layout's, set by `SITE_IS_PUBLICLY_DISCOVERABLE`, applies here as everywhere (with
 * `next.config.ts`'s header), except that a rate-limited answer is never indexed as
 * this URL's page (RL-F1). The description is the D-2 demo disclosure while the
 * registry holds no real shelters, as on the animal page, and otherwise the shelter's
 * own text - trimmed at a word boundary to 160 characters, never padded past whatever
 * the shelter actually wrote (owner, verbatim: "if it's shorter than 120, leave it
 * short, never pad").
 *
 * `openGraph.title` is omitted, not duplicated: Next resolves a missing one from the
 * page's own already-templated `title` (`/prytulkam`'s and `/pro`'s own metadata
 * already use this), so "og:title matches the page's title" holds without hand-typing
 * the city and brand suffix here too.
 *
 * `alternates.canonical` is always the bare shelter URL, with no `?sort=`/`?page=` -
 * the same policy the gallery's own filter/sort/page variants use (owner, PR B), for
 * the same reason: at this corpus size, one shelter's few animals paginated or
 * re-sorted have no unique indexable value over the shelter's own unparameterised page.
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
  const { shelter, cityName } = load.view;
  const title = [shelter.displayName, cityName].filter(Boolean).join(", ");
  const description = REGISTRY_HAS_NO_REAL_SHELTERS
    ? uk.demo.bannerNotice
    : trimAtWordBoundary(textIn(shelter.description, "uk"), META_DESCRIPTION_MAX_LENGTH);
  return {
    title,
    description,
    // `shelter.id`, not the raw route param - same reasoning as the animal page's own
    // canonical (found on review): a UUID's schema accepts any case, so a request that
    // happened to use uppercase would otherwise get a canonical that disagrees with the
    // lowercase form every other link on the site actually uses.
    alternates: { canonical: `/prytulky/${shelter.id}` },
    openGraph: { type: "website", description },
  };
}
