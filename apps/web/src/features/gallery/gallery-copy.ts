import { pluralizeUk } from "@opika/domain";
import { ukPublic as uk } from "@opika/i18n/public";

/**
 * Composes the two result-count sentences `packages/i18n`'s templates
 * cannot finish on their own - a template can hold static text around a
 * slot, but only code can pick which Ukrainian noun form belongs in it.
 * Two functions, not one, because the sheet and the rail use genuinely
 * different sentences (`docs/design/README.md`, "03 · Фільтри" vs "Rail,
 * count, sort"), not the same one reused at two widths.
 */

/** Both sentences open with the impersonal "Знайдено …", which governs the accusative - see `uk.ts`'s note on `resultCountRail`. Agrees for 1, 2, 5, 11, 21 and 22 (`gallery-copy.test.ts`). */
const animalWordAccusative = (count: number) => pluralizeUk(count, uk.filters.animalWordAccusative);
const shelterWordLocative = (count: number) => pluralizeUk(count, uk.filters.shelterWordLocative);

/**
 * "Знайдено {count} тварин. Притулків у цьому місті: {shelterCount}." when
 * a city is selected - design's own screen 03 sentence, written for exactly
 * that case. With no city constrained (`cityConstrained: false` - "Усі
 * міста", the sheet's own default), `shelterCount` spans every
 * city shown and "у цьому місті" would name a city that isn't selected; falls
 * back to the rail's locative shelter phrasing instead.
 */
export function sheetResultCount(
  count: number,
  shelterCount: number,
  cityConstrained: boolean,
): string {
  const template = cityConstrained ? uk.filters.resultCount : uk.filters.resultCountAnyCity;
  return template
    .replace("{count}", String(count))
    .replace("{animalWord}", animalWordAccusative(count))
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
