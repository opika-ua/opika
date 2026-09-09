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
-- Slugs computed by running `citySlugOf` (`packages/domain`) against each
-- name, not hand-transcribed — verified to match `CITY_DATA`'s own
-- pre-existing `en.text` for every one of the 8 (`Kyiv`, `Brovary`, `Irpin`,
-- `Bucha`, `Vyshhorod`, `Boryspil`, `Fastiv`, `Bila Tserkva`).
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
