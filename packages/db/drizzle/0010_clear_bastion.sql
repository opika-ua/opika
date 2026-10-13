-- H2 handlers slice, HS-Q9 (Oleksii: "(b). Add first_published_at (timestamptz,
-- set on first publish, never cleared)"). deleteDraft refuses a draft whose
-- first_published_at is set: restore_to_draft drops the listing's own
-- publishedAt, so this column is what remembers a draft used to be public.
ALTER TABLE "animals" ADD COLUMN "first_published_at" timestamp with time zone;--> statement-breakpoint
--
-- Backfill. Published and reserved listings carry publishedAt: that is the
-- value (Oleksii: "Backfill from published_at where present").
UPDATE "animals"
SET "first_published_at" = ("listing"->>'publishedAt')::timestamptz
WHERE "listing_kind" IN ('published', 'reserved')
  AND "first_published_at" IS NULL;--> statement-breakpoint
--
-- Adopted and withdrawn listings were necessarily public (the FSM reaches
-- them only from published/reserved) but no longer carry publishedAt. Their
-- own instant stands in as "public no later than", not the real first
-- publication (HS-Q11, Oleksii: "A"), so a withdrawn listing restored to
-- draft still can't be deleted.
UPDATE "animals"
SET "first_published_at" = CASE "listing_kind"
    WHEN 'adopted' THEN ("listing"->>'adoptedAt')::timestamptz
    WHEN 'withdrawn' THEN ("listing"->>'withdrawnAt')::timestamptz
  END
WHERE "listing_kind" IN ('adopted', 'withdrawn')
  AND "first_published_at" IS NULL;--> statement-breakpoint
--
-- Abort rather than leave a once-public listing unmarked. (Drafts need no
-- check: the column is created above and nothing here writes a draft.)
DO $$
DECLARE
  unmarked integer;
BEGIN
  SELECT count(*) INTO unmarked FROM "animals"
  WHERE "listing_kind" <> 'draft' AND "first_published_at" IS NULL;
  IF unmarked > 0 THEN
    RAISE EXCEPTION
      'HS-Q9 first_published_at backfill is wrong: % non-draft listings unmarked', unmarked;
  END IF;
END $$;
