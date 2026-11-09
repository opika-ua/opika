import { pluralizeUk, type UkrainianPluralForms } from "@opika/domain";
import { fillTemplate } from "@opika/i18n";

const integer = new Intl.NumberFormat("uk");

/** «15 хвилин», «1 годину»: the number and the noun form it takes, so no template types the noun. */
export function countPhrase(count: number, forms: UkrainianPluralForms): string {
  return fillTemplate(pluralizeUk(count, forms), { count: integer.format(count) });
}
