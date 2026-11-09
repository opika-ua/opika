import { loadAnimalPage } from "../../../features/animal-detail/animal-page-load";
import {
  animalOgImage,
  OG_CONTENT_TYPE,
  OG_SIZE,
  SHORT_ANIMAL_CACHE,
  siteOgImage,
} from "../../../seo/og-image";

export const dynamic = "force-dynamic";
export const alt = "";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/** A missing, hidden or rate-limited animal gets the site card, never an error image, cached briefly so a later listing is not hidden behind it. */
export default async function Image({ params }: { params: Promise<{ animalId: string }> }) {
  const { animalId } = await params;
  const load = await loadAnimalPage(animalId);
  return load.kind === "animal" ? animalOgImage(load.view) : siteOgImage(SHORT_ANIMAL_CACHE);
}
