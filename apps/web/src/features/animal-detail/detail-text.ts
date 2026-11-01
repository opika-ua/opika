import type { AnimalDetailView } from "@opika/contracts";
import { uk } from "@opika/i18n";

/**
 * Singular, common gender regardless of `sex` - the catalogue's own flagged
 * simplification (`uk.detail.speciesDog`'s own comment), not a new one introduced by
 * exporting this. Reused by `[animalId]/page.tsx`'s `generateMetadata` (PR B, the SEO
 * review) for the title's `{species}` segment, rather than that file keeping its own
 * copy of this species → label mapping.
 *
 * `animalSubtitle`/`animalLocationLine`, this function's own former neighbours, were
 * retired in pet card PR 5: the new panel header's meta line is sex · age bucket · size
 * (`AnimalDetailScreen.tsx`'s own `MetaLine`, matching the gallery card's `cardFactsParts`),
 * not species · age · size, and the header shows the bare city name as text beside a
 * decorative location icon (owner decision 6), not a composed sentence.
 */
export function speciesLabel(species: AnimalDetailView["species"]): string {
  return species === "dog" ? uk.detail.speciesDog : uk.detail.speciesCat;
}
