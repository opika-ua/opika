import type { AnimalDetailView } from "@opika/contracts";
import { ageWordFor, sizeLabel, uk } from "@opika/i18n";

function speciesLabel(species: AnimalDetailView["species"]): string {
  return species === "dog" ? uk.detail.speciesDog : uk.detail.speciesCat;
}

/**
 * The line under the animal's name: species · age · size. Its own function,
 * not inlined into `AnimalDetailScreen` (its only caller since S4b unified
 * the animal page and the gallery's overlay into one shared screen
 * component, rendered from both routes) — kept separate for the same reason
 * `CoatFact` is.
 */
export function animalSubtitle(animal: AnimalDetailView): string {
  return [
    speciesLabel(animal.species),
    ageWordFor(animal.ageBucket, animal.sex),
    sizeLabel(animal.size),
  ].join(" · ");
}

/**
 * Where the animal lives, by city only. `animal.publicLocation` is `null` for
 * an animal still at its own shelter, which inherits the shelter's location
 * (`CLAUDE.md` decision #17); non-null means fostered. Either way the view
 * holds the city only (Oleksii, 2026-10-14, EM-Q10), so nullness is the one
 * signal, and a fostered animal is a place name, never a pin.
 */
export function animalLocationLine(animal: AnimalDetailView, cityName: string | null): string {
  const isFostered = animal.publicLocation !== null;
  return (isFostered ? uk.location.lineFostered : uk.location.lineAtShelter).replace(
    "{city}",
    () => cityName ?? "",
  );
}
