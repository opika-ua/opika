import { z } from "zod";

/**
 * A public, human-readable identifier for a city — `brovary`, not
 * `c1000000-0000-4000-8000-000000000001` (`docs/observations.md`'s O-6).
 * Lowercase ASCII words joined by single hyphens: the only shape a URL query
 * value and a search engine both read as a place name rather than an opaque
 * token.
 */
export const CitySlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  .brand<"CitySlug">();
export type CitySlug = z.infer<typeof CitySlugSchema>;

/**
 * Derives a `CitySlug` from a city's own human-authored English name
 * (`City.name.en.text` — `packages/db/src/schema/cities.ts`'s `nameEnText`,
 * always `provenance: "human"` for every city this repo seeds today).
 * Lowercase, spaces to hyphens — Oleksii's own instruction, kept literal
 * rather than widened into a general punctuation sanitiser. A run of
 * whitespace collapses to one hyphen; nothing else is rewritten. A name
 * containing anything `CitySlugSchema`'s regex doesn't accept (an
 * apostrophe, a period, a digit-adjacent symbol) fails loudly at the
 * `.parse()` below rather than being silently cleaned into something that
 * merely looks plausible — this repo's own standing preference for a real
 * name to force a real decision over a guessed one.
 *
 * **Not a transliteration of the Ukrainian name — dropped 2026-09-12,
 * Oleksii's own instruction, after confirming Neon's real `cities` table
 * holds exactly the 8 seeded rows.** The original implementation ran a real
 * Ukrainian National transliteration table (Резолюція КМУ №55, 27.01.2010)
 * against `name.uk`, and every seeded city's transliterated slug happened to
 * agree with its own already-curated `name.en.text`. "Happened to agree" was
 * the actual defect: `cities` already stores a human-authored English name
 * for exactly this purpose, and deriving the slug from a *second*,
 * independent source — an algorithm run against the Ukrainian name — gives
 * one city two candidate Latin spellings that are correct only for as long
 * as they never diverge. The day a city's official English name doesn't
 * match what the transliteration table would produce (a documented KMU
 * exception, a long-standing conventional spelling the algorithm's own table
 * doesn't reach), the two sources disagree, and there is no rule for which
 * one the slug should have followed. Deriving directly from the same
 * human-verified field the product already trusts for display removes the
 * second source entirely — there is no transliteration table in this file
 * for a future edit to quietly bring back.
 *
 * Takes the plain English string, not a `LocalizedText` — `LocalizedText.en`
 * is nullable (a city can be Ukrainian-only, schema-legally), and this
 * function has no sensible fallback for that case now that transliteration
 * is gone. **Every caller must resolve and reject a missing/empty English
 * name itself, before calling this** — silently falling back to the
 * Ukrainian name here would resurrect the exact two-sources problem this
 * change exists to remove, just moved one call frame up.
 * `packages/db/src/seed.ts`'s `requireEnglishCityName` is the current, only
 * real caller's guard.
 */
export function citySlugOf(nameEn: string): CitySlug {
  const slug = nameEn.trim().toLowerCase().replace(/\s+/g, "-");
  return CitySlugSchema.parse(slug);
}
