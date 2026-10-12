ALTER TABLE "shelters" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
--
-- H2 S3. Published and reserved listings gain `undoable` (H2-16 → B, S3-Q1 → A):
-- the confirmation a «Ще шукає» replaced, kept so an undo inside the window can
-- restore it exactly. No existing row has a confirmation to undo, so every one
-- gets "undoable": null.
--
-- Only rows still missing the key are touched, so a row already in the new
-- shape is left as it is. (The UPDATE alone is re-runnable; the ADD COLUMN is
-- not, and the drizzle journal is what stops a second run.)
UPDATE "animals"
SET "listing" = jsonb_set("listing", '{undoable}', 'null'::jsonb)
WHERE "listing_kind" IN ('published', 'reserved')
  AND NOT ("listing" ? 'undoable');--> statement-breakpoint
--
-- Abort loudly rather than leave a visible listing the domain can't read, or a
-- draft/adopted/withdrawn row carrying an undo it can't have.
DO $$
DECLARE
  missing integer;
  on_invisible integer;
BEGIN
  SELECT count(*) INTO missing
  FROM "animals"
  WHERE "listing_kind" IN ('published', 'reserved')
    AND NOT ("listing" ? 'undoable');

  SELECT count(*) INTO on_invisible
  FROM "animals"
  WHERE "listing_kind" NOT IN ('published', 'reserved')
    AND "listing" ? 'undoable';

  IF missing > 0 OR on_invisible > 0 THEN
    RAISE EXCEPTION
      'H2 S3 undoable backfill is wrong: % visible listings without undoable, % non-visible listings carrying it',
      missing, on_invisible;
  END IF;
END $$;
