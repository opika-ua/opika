-- Drops two indexes no query uses since the gallery filter restructure removed the temperament and colour filters.
-- Destructive only for the indexes: no row or column changes. Plain DROP INDEX, not CONCURRENTLY: drizzle runs
-- migrations in one transaction, which CONCURRENTLY cannot; the brief lock on a small table is acceptable.
-- Rollback (re-creates them as migration 0017 did):
--   CREATE INDEX "animals_temperament_traits_idx" ON "animals" USING gin ("temperament_traits") WHERE listing_kind IN ('published', 'reserved');
--   CREATE INDEX "animals_coat_colour_idx" ON "animals" USING btree ("coat_colour") WHERE listing_kind IN ('published', 'reserved');
DROP INDEX IF EXISTS "animals_temperament_traits_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "animals_coat_colour_idx";
