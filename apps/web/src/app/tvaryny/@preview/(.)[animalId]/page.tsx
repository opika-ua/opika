import { AnimalIdSchema } from "@opika/domain";
import type { ReactNode } from "react";
import { AnimalDetailScreen } from "../../../../features/animal-detail/AnimalDetailScreen";
import {
  type AnimalOverlayNotice,
  AnimalOverlayNoticeView,
  overlayNoticeTitle,
} from "../../../../features/animal-detail/AnimalPageStates";
import {
  type AnimalPageClient,
  loadAnimalPage,
} from "../../../../features/animal-detail/animal-page-load";
import { AnimalOverlay } from "../../../../features/animal-overlay/AnimalOverlay";

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
 * sentence, RL-F1), and any other failure reaches `/tvaryny/error.tsx` —
 * three distinct answers, not two, and replacing the gallery is exactly
 * what the overlay exists to avoid. Here, all three are said inside the
 * dialog instead (`AnimalPageStates.tsx`'s own comment has the mapping).
 */
export default async function AnimalOverlayPage({
  params,
}: {
  params: Promise<{ animalId: string }>;
}) {
  const { animalId } = await params;
  return renderAnimalOverlay(animalId);
}

/** The overlay for an id; `client` is a test's stub, the page's own client otherwise. */
export async function renderAnimalOverlay(
  animalId: string,
  client?: AnimalPageClient,
): Promise<ReactNode> {
  // Not an animal id: some other `/tvaryny/…` path the interception's
  // `[animalId]` pattern also fits (DR1-S4-T2 met `gortaty`). No overlay.
  if (!AnimalIdSchema.safeParse(animalId).success) return null;
  const openerHref = `/tvaryny/${animalId}`;
  const notice = (kind: AnimalOverlayNotice) => (
    <AnimalOverlay label={overlayNoticeTitle(kind)} openerHref={openerHref}>
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
  return (
    <AnimalOverlay label={load.view.animal.name} openerHref={openerHref}>
      <AnimalDetailScreen {...load.view} />
    </AnimalOverlay>
  );
}
