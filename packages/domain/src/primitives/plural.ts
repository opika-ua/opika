/**
 * Ukrainian count-noun agreement, via `Intl.PluralRules` rather than a
 * hand-rolled modulo table — the same "native `Intl` over a hand-rolled
 * rule" principle `CLAUDE.md` states for dates, applied to plurals.
 * `Intl.PluralRules('uk').select(n)` returns `one` (1, 21, 31…), `few` (2-4,
 * 22-24…) or `many` (0, 5-20, 25-30…) for every integer; `other` only ever
 * appears for non-integer input, which a count never is here.
 *
 * Not locale-generic: English's plural categories (`one`/`other`) don't map
 * onto Ukrainian's (`one`/`few`/`many`), so a shared cross-locale signature
 * would either lie about what it accepts or force every caller to supply
 * categories their locale doesn't have. `en.ts` needs no equivalent — a
 * plain ternary covers English's one distinction.
 */
export type UkrainianPluralForms = {
  one: string;
  few: string;
  many: string;
};

const UK_PLURAL_RULES = new Intl.PluralRules("uk");

export const pluralizeUk = (count: number, forms: UkrainianPluralForms): string => {
  const category = UK_PLURAL_RULES.select(count);
  if (category === "one") return forms.one;
  if (category === "few") return forms.few;
  return forms.many;
};
