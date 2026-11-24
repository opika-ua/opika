import type { AnimalId, AnimalSex } from "@opika/domain";
import { fillTemplate, ukPublic as uk } from "@opika/i18n/public";
import { SITE_ORIGIN, WORDMARK } from "../../brand";

export interface FirstMessageInput {
  readonly animalName: string;
  readonly sex: AnimalSex;
  readonly animalUrl: string;
}

/** The card's canonical address, built as `ShareButton` builds it: no gallery query, no overlay state. */
export const animalPageUrl = (animalId: AnimalId): string => `${SITE_ORIGIN}/tvaryny/${animalId}`;

/**
 * The suggested first message to the shelter. Built only from what the page already shows;
 * nothing is sent, the person copies it or opens their own app with it.
 */
export function firstMessageOf({ animalName, sex, animalUrl }: FirstMessageInput): string {
  return fillTemplate(uk.reveal.firstMessage[sex], {
    name: animalName,
    site: WORDMARK,
    url: animalUrl,
  });
}
