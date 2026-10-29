-- S3 review: deleting an orphaned adopter ran its foreign-key check as a full scan of "sessions".
-- Additive. Plain, not CONCURRENTLY: drizzle runs migrations inside one transaction; the build
-- briefly holds session writes (bootstrap, last-seen touch), which at today's size is milliseconds.
CREATE INDEX "sessions_adopter_id_idx" ON "sessions" USING btree ("adopter_id");