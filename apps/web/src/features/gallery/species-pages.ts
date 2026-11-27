import { ANIMAL_SPECIES, type AnimalSpecies } from "@opika/domain/core";

/**
 * The species landing pages (owner, 2026-11-27): `/tvaryny/vyd/sobaky` and `/tvaryny/vyd/koty`.
 * Two segments, like the city pages: a one-segment `/tvaryny/{x}` is caught by the animal
 * overlay's interception rewrite on every client navigation (DR1-S4-T2).
 */
export const SPECIES_PAGE_PATH = "/tvaryny/vyd";

const SLUG: Readonly<Record<AnimalSpecies, string>> = { dog: "sobaky", cat: "koty" };

export const speciesPageSlug = (species: AnimalSpecies): string => SLUG[species];

export const speciesPagePath = (species: AnimalSpecies): string =>
  `${SPECIES_PAGE_PATH}/${SLUG[species]}`;

/** The species a page slug names, or null for any other slug. */
export const speciesOfSlug = (slug: string): AnimalSpecies | null =>
  ANIMAL_SPECIES.find((species) => SLUG[species] === slug) ?? null;

/** No thin pages: a species page exists only with this many listed animals of verified shelters. */
export const SPECIES_PAGE_MIN_ANIMALS = 10;

/**
 * The one threshold check: the species page itself (200 or 404), the sitemap, and the gallery's
 * links and canonical all ask this, from `gallery.facetCounts`' `indexableBySpecies`.
 */
export function speciesWithPages(
  indexableBySpecies: Readonly<Record<AnimalSpecies, number>>,
): ReadonlySet<AnimalSpecies> {
  return new Set(
    ANIMAL_SPECIES.filter((species) => indexableBySpecies[species] >= SPECIES_PAGE_MIN_ANIMALS),
  );
}
