import { type AnimalId, AnimalIdSchema } from "@opika/domain";
import type { ReactNode } from "react";
import { anonymousRouterClient } from "../../../../api/server-client";
import { AnimalDetailContent } from "../../../../features/animal-detail/AnimalDetailScreen";
import {
  type AnimalOverlayNotice,
  AnimalOverlayNoticeView,
  overlayNoticeTitle,
} from "../../../../features/animal-detail/AnimalPageStates";
import {
  type AnimalPageClient,
  loadAnimalPage,
} from "../../../../features/animal-detail/animal-page-load";
import {
  AnimalOverlay,
  type OverlayNeighbour,
} from "../../../../features/animal-overlay/AnimalOverlay";
import type { SearchParams } from "../../../../features/gallery/filter-url";
import { animalPageHref, parseGalleryQuery } from "../../../../features/gallery/filter-url";

/** Same reasoning as the full page: the overlay reads live listing data. */
export const dynamic = "force-dynamic";

/**
 * The gallery's animal overlay (designer round 1, §2; Oleksii, 2026-10-21:
 * "One component: the gallery opens the same AnimalDetailScreen in an
 * overlay"). A client navigation from the gallery to `/tvaryny/{id}` lands
 * here and draws the overlay over the gallery, which stays mounted with its
 * scroll, filters and page. A direct load of the same URL never comes here;
 * it renders `../../[animalId]/page.tsx`, the full page.
 *
 * Same loader, same component, same props as the full page, so the overlay
 * shows exactly what the page shows (his Q1) and the two can't drift. Only
 * the states without an animal differ in form, not in substance: the full
 * page's `not_found` is its 404, `rate_limited` is its own screen (his
 * sentence, RL-F1), and any other failure reaches `/tvaryny/error.tsx` -
 * three distinct answers, not two, and replacing the gallery is exactly
 * what the overlay exists to avoid. Here, all three are said inside the
 * dialog instead (`AnimalPageStates.tsx`'s own comment has the mapping).
 *
 * Pet card PR 5, owner decision B: this route owns the entire client-side
 * `animals.neighbours` wiring - `searchParams` carries the gallery's own
 * filter and sort (the same query every card link now builds via
 * `animalPageHref`), parsed with the gallery's own `parseGalleryQuery` so
 * the two can't drift apart. A neighbours failure never fails the whole
 * overlay (it's a non-critical enhancement, not core content): both sides
 * fall back to `null`, same as a real end of the result set.
 */
export default async function AnimalOverlayPage({
  params,
  searchParams,
}: {
  params: Promise<{ animalId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ animalId }, rawSearchParams] = await Promise.all([params, searchParams]);
  return renderAnimalOverlay(animalId, rawSearchParams);
}

/** The overlay for an id; `client` is a test's stub, the page's own client otherwise. */
export async function renderAnimalOverlay(
  animalId: string,
  rawSearchParams: SearchParams = {},
  client?: AnimalPageClient,
): Promise<ReactNode> {
  // Not an animal id: some other `/tvaryny/…` path the interception's
  // `[animalId]` pattern also fits (DR1-S4-T2 met `gortaty`). No overlay.
  if (!AnimalIdSchema.safeParse(animalId).success) return null;
  const openerHref = `/tvaryny/${animalId}`;
  const noNeighbours = { prev: null, next: null };
  const notice = (kind: AnimalOverlayNotice) => (
    <AnimalOverlay
      label={overlayNoticeTitle(kind)}
      openerHref={openerHref}
      neighbours={noNeighbours}
    >
      <AnimalOverlayNoticeView kind={kind} />
    </AnimalOverlay>
  );

  let load: Awaited<ReturnType<typeof loadAnimalPage>>;
  try {
    load = await loadAnimalPage(animalId, client);
  } catch {
    // The full page lets this reach `/tvaryny/error.tsx`; from here that
    // boundary would replace the gallery the visitor is still using.
    return notice("failed");
  }
  if (load.kind !== "animal") return notice(load.kind);

  const neighbours = await neighboursOf(
    client ?? anonymousRouterClient(),
    load.view.animal.id,
    rawSearchParams,
  );

  return (
    <AnimalOverlay label={load.view.animal.name} openerHref={openerHref} neighbours={neighbours}>
      <AnimalDetailContent {...load.view} />
    </AnimalOverlay>
  );
}

/**
 * The gallery's current filter and sort, parsed from the same query scheme
 * `animalPageHref` writes it in, then `animals.neighbours` (PR #217,
 * already fully implemented server-side) walks the identical result set
 * `gallery.list` would. A city lookup of its own (`cities.list`), since this
 * route - unlike `loadAnimalPage`, which already makes its own call for the
 * city *name* - has no other reason to fetch cities today; not threaded
 * through `loadAnimalPage` to avoid coupling that shared loader (also used
 * by the full page, which never needs this) to the overlay's own concern.
 */
async function neighboursOf(
  client: AnimalPageClient,
  animalId: AnimalId,
  rawSearchParams: SearchParams,
): Promise<{ prev: OverlayNeighbour; next: OverlayNeighbour }> {
  try {
    const cities = await client.cities.list({});
    const citySlugs = new Map(cities.map((city) => [city.id, city.slug]));
    const citiesBySlug = new Map(cities.map((city) => [city.slug, city.id]));
    const { filters, sort } = parseGalleryQuery(rawSearchParams, citiesBySlug);

    const { prev, next } = await client.animals.neighbours({ animalId, filters, sort });
    return {
      prev: prev
        ? { name: prev.name, href: animalPageHref(prev.id, filters, sort, citySlugs) }
        : null,
      next: next
        ? { name: next.name, href: animalPageHref(next.id, filters, sort, citySlugs) }
        : null,
    };
  } catch {
    return { prev: null, next: null };
  }
}
