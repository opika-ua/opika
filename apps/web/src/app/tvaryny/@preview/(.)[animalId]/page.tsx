import { type AnimalId, AnimalIdSchema, textIn } from "@opika/domain";
import { anonymousRouterClient } from "../../../../api/server-client";
import {
  type AnimalPreviewContent,
  AnimalPreviewDrawer,
} from "../../../../features/animal-preview/AnimalPreviewDrawer";

/** Same reasoning as the full page: the drawer reads live listing data. */
export const dynamic = "force-dynamic";

/**
 * The preview drawer (designer round 1, §2, DR1-D5): a client navigation
 * from the gallery to `/tvaryny/{id}` lands here and draws the drawer over
 * the gallery, which stays mounted with its scroll, filters and page. A
 * direct load of the same URL never comes here; it renders
 * `../../[animalId]/page.tsx`, the full page.
 *
 * Reads `animals.byId`, as the full page does, and nothing else is recorded:
 * no `swipes.record`, no event. The city comes from the view itself (the
 * foster city, or the shelter's), so the drawer needs no `shelters.byId`.
 */
export default async function AnimalPreviewPage({
  params,
}: {
  params: Promise<{ animalId: string }>;
}) {
  const { animalId: rawAnimalId } = await params;
  const parsedId = AnimalIdSchema.safeParse(rawAnimalId);
  if (!parsedId.success) return null;
  return (
    <AnimalPreviewDrawer animalId={parsedId.data} content={await previewContent(parsedId.data)} />
  );
}

/**
 * `animals.byId` answers one `NOT_FOUND` for a missing, undiscoverable or
 * unverified-shelter animal alike; any failure here becomes the drawer's
 * not-found state, as the full page turns any failure of the same call into
 * its 404.
 */
async function previewContent(animalId: AnimalId): Promise<AnimalPreviewContent> {
  const client = anonymousRouterClient();
  try {
    const [animal, cities] = await Promise.all([
      client.animals.byId({ animalId }),
      client.cities.list({}),
    ]);
    const cityId = animal.publicLocation?.cityId ?? animal.shelter.publicLocation.cityId;
    const city = cities.find((c) => c.id === cityId);
    return { kind: "animal", animal, cityName: city ? textIn(city.name, "uk") : null };
  } catch {
    return { kind: "not_found" };
  }
}
