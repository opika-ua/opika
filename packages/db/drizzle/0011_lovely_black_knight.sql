-- H2 registry PR. animals.version (S3-T6, Oleksii: "integer version for animals
-- too (same as shelters)"): the compare-and-set guard for edits. Every existing
-- row starts at 0, the same as shelters.version in 0008. Listing moves never bump
-- it. Purely additive. To be rehearsed on a child branch before production (S3-T6).
ALTER TABLE "animals" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;