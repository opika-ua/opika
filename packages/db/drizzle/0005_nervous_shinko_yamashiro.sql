--
-- Tightening `name_en_text`/`name_en_provenance` to NOT NULL, added
-- 2026-09-12 — a required value (the slug this migration is about to add)
-- cannot honestly depend on an optional one. Both columns predate this
-- migration (`0000_shallow_wasp.sql`), so this is the first time either is
-- constrained; not folded into the ADD COLUMN below because `slug` is new
-- and these are existing columns finally being pinned to what every real
-- row already has.
--
-- Verified against Neon first, not assumed: exactly these 8 rows, all 8
-- carrying both fields (Oleksii, 2026-09-12). The assertion below re-checks
-- that independently at migration time rather than trusting the earlier
-- verification to still hold — the same "abort loudly, don't guess" posture
-- `slug`'s own backfill uses two blocks down, applied to a claim instead of
-- a computation. Tightened together, not `name_en_text` alone:
-- `packages/db/src/repos/mappers.ts`'s `columnsToLocalizedText` already
-- requires both non-null before it treats a city as having a real English
-- name at all — leaving one nullable would just move the same "required
-- value depending on an optional one" problem to whichever field was left
-- open.
DO $$
DECLARE
  incomplete integer;
BEGIN
  SELECT count(*) INTO incomplete FROM "cities"
    WHERE "name_en_text" IS NULL OR "name_en_provenance" IS NULL;
  IF incomplete > 0 THEN
    RAISE EXCEPTION
      'cities.name_en_text/name_en_provenance tightening is unsafe: % row(s) are missing one or both. A city with no English name needs one recorded before this migration can run — this is a real gap to fill, not a migration to relax.',
      incomplete;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "cities" ALTER COLUMN "name_en_text" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cities" ALTER COLUMN "name_en_provenance" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cities" ADD COLUMN "slug" text;--> statement-breakpoint
--
-- Backfill, hand-edited rather than generated — same reason as 0004's own
-- `wait_anchor_at` migration: `ADD COLUMN ... NOT NULL` with no default fails
-- outright against any `cities` table that already has rows, and this repo's
-- only real target (Neon) does — the same 8 seeded cities O-9 measured.
--
-- Matched by `id`, not `name_uk`, because `id` is the stable key and this
-- repo's seed data generates it deterministically (`seed.ts`'s `cityId(i)`,
-- `seededUuid("c1000000", i)`) — these 8 values are exactly what a fresh
-- `db:seed` run against an empty database produces, in order, and are the
-- only cities this repository's own seed data has ever created anywhere.
--
-- Slugs computed by running `citySlugOf` (`packages/domain`) against each
-- city's `name_en_text` (`Kyiv`, `Brovary`, `Irpin`, `Bucha`, `Vyshhorod`,
-- `Boryspil`, `Fastiv`, `Bila Tserkva`), not hand-transcribed and not derived
-- from `name_uk`. **Changed 2026-09-12, Oleksii's own instruction, after
-- confirming Neon's real `cities` table holds exactly these 8 rows**:
-- `citySlugOf` originally ran a Ukrainian-to-Latin transliteration table
-- against `name_uk` instead, which happened to reproduce the same 8 literal
-- values seen below — but "happened to agree" was the defect, not evidence
-- the table was right. `name_en_text` is the human-authored, already-curated
-- English name this product already trusts for English-locale display; a
-- second, independently-computed Latin spelling of the same city is a
-- standing risk of the two ever disagreeing, not a safety net. See
-- `city-slug.ts`'s own doc comment for the full reasoning — the
-- transliteration table itself no longer exists in this codebase, so
-- reintroducing it as a "fallback" is not a one-line revert.
--
-- `name_en_text` is `NOT NULL` as of this same migration (above) — not a
-- live concern for this backfill specifically either way, since it applies
-- fixed literal values matched by `id`, not a runtime read of the column.
-- The column's nullability *was* a real question for whichever code path
-- derives a slug for a city this migration doesn't know about — a `new`
-- city added after this ships (H2 admin onboarding, not built yet) — and
-- that guard lives with that future caller
-- (`packages/db/src/seed.ts`'s `requireEnglishCityName`, today's only real
-- caller), not here. `requireEnglishCityName` stays even though the column
-- is now `NOT NULL` in the database: the domain type it validates
-- (`LocalizedText.en`) is still nullable in general — City's own table
-- happens to be stricter than the shared type it's built from.
UPDATE "cities" SET "slug" = CASE "id"
  WHEN 'c1000000-0000-4000-8000-000000000000' THEN 'kyiv'
  WHEN 'c1000000-0000-4000-8000-000000000001' THEN 'brovary'
  WHEN 'c1000000-0000-4000-8000-000000000002' THEN 'irpin'
  WHEN 'c1000000-0000-4000-8000-000000000003' THEN 'bucha'
  WHEN 'c1000000-0000-4000-8000-000000000004' THEN 'vyshhorod'
  WHEN 'c1000000-0000-4000-8000-000000000005' THEN 'boryspil'
  WHEN 'c1000000-0000-4000-8000-000000000006' THEN 'fastiv'
  WHEN 'c1000000-0000-4000-8000-000000000007' THEN 'bila-tserkva'
END;--> statement-breakpoint
--
-- The assertion, same posture as 0004's own: abort loudly rather than let a
-- row this list didn't anticipate ride through as a silent NULL that then
-- fails the NOT NULL step below with a generic, less useful error. A row
-- surviving to this point that isn't one of the 8 known ids means the
-- target database is not what this migration assumes it is — onboarding
-- (H2) has already added a real city, or this ran against an environment
-- with different seed data — and that is exactly the case that needs a
-- human decision, not a guessed slug.
DO $$
DECLARE
  unmatched integer;
BEGIN
  SELECT count(*) INTO unmatched FROM "cities" WHERE "slug" IS NULL;
  IF unmatched > 0 THEN
    RAISE EXCEPTION
      'cities.slug backfill is incomplete: % row(s) matched none of the 8 known seeded city ids. This migration only knows the fixed seed corpus — add this city to the CASE above (with a slug from citySlugOf) before re-running.',
      unmatched;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "cities" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cities" ADD CONSTRAINT "cities_slug_unique" UNIQUE("slug");
