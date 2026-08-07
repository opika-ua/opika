import { pluralizeUk } from "@opika/domain";
import { uk } from "@opika/i18n";

/**
 * Composes the two result-count sentences `packages/i18n`'s templates
 * cannot finish on their own — a template can hold static text around a
 * slot, but only code can pick which Ukrainian noun form belongs in it.
 * Two functions, not one, because the sheet and the rail use genuinely
 * different sentences (`docs/design/README.md`, "03 · Фільтри" vs "Rail,
 * count, sort"), not the same one reused at two widths.
 */

const animalWord = (count: number) => pluralizeUk(count, uk.filters.animalWord);
/** The rail's "Знайдено …" governs the accusative; the sheet's "Підходить …" is nominative. They differ only at `one` — see `uk.ts`'s note on `resultCountRail`. */
const animalWordAccusative = (count: number) => pluralizeUk(count, uk.filters.animalWordAccusative);
const shelterWordLocative = (count: number) => pluralizeUk(count, uk.filters.shelterWordLocative);

/**
 * "Підходить {count} тварин. Притулків у цьому місті — {shelterCount}." when
 * a city is selected — design's own screen 03 copy, written for exactly
 * that case. With no city constrained (`cityConstrained: false` — "Уся
 * Київщина", the sheet's own default), `shelterCount` spans the whole
 * oblast and "у цьому місті" would name a city that isn't selected; falls
 * back to the rail's locative shelter phrasing instead, in the sheet's own
 * verb and register.
 */
export function sheetResultCount(
  count: number,
  shelterCount: number,
  cityConstrained: boolean,
): string {
  const template = cityConstrained ? uk.filters.resultCount : uk.filters.resultCountAnyCity;
  return template
    .replace("{count}", String(count))
    .replace("{animalWord}", animalWord(count))
    .replace("{shelterCount}", String(shelterCount))
    .replace("{shelterWord}", shelterWordLocative(shelterCount));
}

/** "Знайдено {count} тварин у {shelterCount} притулках" */
export function railResultCount(count: number, shelterCount: number): string {
  return uk.filters.resultCountRail
    .replace("{count}", String(count))
    .replace("{animalWord}", animalWordAccusative(count))
    .replace("{shelterCount}", String(shelterCount))
    .replace("{shelterWord}", shelterWordLocative(shelterCount));
}

/** "Показати {count}" */
export function showCountLabel(count: number): string {
  return uk.filters.showCount.replace("{count}", String(count));
}
