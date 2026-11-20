-- The 90-day reveal clean-up (owner, 2026-11-20, privacy policy D2) deletes by revealed_at range;
-- the only index with that column leads on adopter_id. Additive. Plain, not CONCURRENTLY: drizzle
-- runs migrations in one transaction; the build briefly holds reveal writes, milliseconds at this size.
CREATE INDEX "reveals_revealed_at_idx" ON "reveals" USING btree ("revealed_at");