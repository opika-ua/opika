-- Pet card PR 3a: a shelter's own logo (storageKey + dimensions, the same
-- shape as an animal photo). Additive, nullable, no backfill - every
-- existing shelter reads as having no logo, which is honest: none has
-- uploaded one yet. The upload itself (PR 3b) waits on the R2 clean-up
-- job covering shelters/*/logo/ first (PR 4).
ALTER TABLE "shelters" ADD COLUMN "logo" jsonb;