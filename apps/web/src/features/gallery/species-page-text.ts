import type { AnimalSpecies, SpeciesPhraseKey } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import { pagedTitle } from "../../seo/page-metadata";
import { REGISTRY_HAS_NO_REAL_SHELTERS } from "../../seo-flags";

const PHRASE: Readonly<Record<AnimalSpecies, SpeciesPhraseKey>> = { dog: "dogs", cat: "cats" };

/** «Собаки шукають дім» (owner, 2026-11-27). */
export const speciesPageHeading = (species: AnimalSpecies): string =>
  fillTemplate(uk.speciesPage.heading, {
    species: uk.seo.speciesPhrase.capitalised[PHRASE[species]],
  });

/** «Взяти собаку з притулку – Opika», page 2 onwards named; D-2's demo description like a city page's. */
export function speciesSeoText(
  species: AnimalSpecies,
  page = 1,
): { title: string; description: string } {
  const subject = fillTemplate(uk.seo.species.title, {
    species: uk.seo.speciesPhrase.accusative[PHRASE[species]],
  });
  const description = REGISTRY_HAS_NO_REAL_SHELTERS
    ? uk.demo.bannerNotice
    : fillTemplate(uk.seo.species.description, {
        species: uk.seo.speciesPhrase.capitalised[PHRASE[species]],
      });
  return { title: pagedTitle(subject, page), description };
}
