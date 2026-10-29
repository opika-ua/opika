/**
 * Retired token classes (`rg-` V2 set, `font-rg`, the `brand-` aliases, the Keeper's Voice set with
 * `font-sans`/`font-serif`) as per-file ceilings. All zero since design system PR 4, so the tables
 * stay empty: the patterns in `patterns.ts` keep failing on any reintroduction. New UI uses the
 * unprefixed tokens and the type scale in `app/globals.css`.
 */
export const TOKEN_CEILINGS: Readonly<
  Record<"rg" | "fontRg" | "brand" | "bare", Readonly<Record<string, number>>>
> = {
  rg: {},
  fontRg: {},
  brand: {},
  bare: {},
};
