ALTER TABLE "animals" ADD COLUMN "wait_anchor_at" timestamp with time zone;--> statement-breakpoint
--
-- Backfill. Runs before the indexes below so they are built once, on final
-- values, and so no window exists where a discoverable row is in a
-- wait-anchor index with a NULL anchor.
--
-- `published` rows already hold the answer: the listing JSONB has carried
-- `publishedAt` since the column existed, it just was not indexed.
UPDATE "animals"
SET "wait_anchor_at" = ("listing"->>'publishedAt')::timestamptz
WHERE "listing_kind" = 'published';--> statement-breakpoint
--
-- `reserved` rows are the risk, and the reason this file is hand-edited rather
-- than purely generated.
--
-- Before this migration the `reserved` variant stored only `since` — the
-- instant the reservation started. No original publication date was ever
-- recorded anywhere, in the JSONB or otherwise, so there is nothing to
-- *restore*; a proxy has to be chosen, and the choice is not obvious in the
-- direction that matters.
--
-- Not `listing->>'since'`, the tempting one. It is present, it is a real
-- timestamp, it would produce a perfectly sortable column — and it is the
-- precise defect `wait_anchor_at` exists to remove, because it dates the
-- moment the animal stopped being available. Backfilling from it would rank
-- the longest-waiting animal in the corpus as one of the newest, silently and
-- permanently. In this repository's seed data it is additionally a single
-- constant across every reserved row, so the resulting ordering would have
-- been flat and would still have looked plausible.
--
-- Not `last_updated_at` either: that is edit time, and for a reserved animal
-- the reservation itself was the edit, so it collapses to roughly `since`.
--
-- `created_at` is the only per-row-varying timestamp that predates the
-- reservation and is not itself the thing being corrected. It is a lower
-- bound rather than the true publication instant — an animal is published at
-- or after its listing is created — which errs toward crediting an animal
-- with slightly more wait than it is owed. That is the honest direction for
-- this sort: it never understates how long an animal has been waiting.
--
-- The listing JSONB is updated in the same statement as the column. Reads go
-- through `rowToAnimal`, which hands the JSONB to the domain type unvalidated;
-- leaving `publishedAt` absent there would give every migrated reserved animal
-- an `AnimalListingState` whose required field is undefined at runtime while
-- typechecking clean.
UPDATE "animals"
SET
  "wait_anchor_at" = "created_at",
  "listing" = jsonb_set(
    "listing",
    '{publishedAt}',
    to_jsonb(to_char("created_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
  )
WHERE "listing_kind" = 'reserved'
  AND "listing"->'publishedAt' IS NULL;--> statement-breakpoint
--
-- The assertion, in the migration rather than beside it, so a backfill that
-- silently produced NULLs or disagreed with its own source aborts the
-- transaction instead of shipping. Every check counts rows that *disagree*
-- with an independently derived value; all three must be zero.
DO $$
DECLARE
  missing_anchor integer;
  published_mismatch integer;
  reserved_mismatch integer;
BEGIN
  SELECT count(*) INTO missing_anchor
  FROM "animals"
  WHERE "listing_kind" IN ('published', 'reserved') AND "wait_anchor_at" IS NULL;

  SELECT count(*) INTO published_mismatch
  FROM "animals"
  WHERE "listing_kind" = 'published'
    AND "wait_anchor_at" IS DISTINCT FROM ("listing"->>'publishedAt')::timestamptz;

  SELECT count(*) INTO reserved_mismatch
  FROM "animals"
  WHERE "listing_kind" = 'reserved'
    AND ("wait_anchor_at" IS DISTINCT FROM "created_at"
      OR ("listing"->>'publishedAt')::timestamptz IS DISTINCT FROM "created_at");

  IF missing_anchor > 0 OR published_mismatch > 0 OR reserved_mismatch > 0 THEN
    RAISE EXCEPTION
      'wait_anchor_at backfill is wrong: % discoverable rows with no anchor, % published rows disagreeing with listing.publishedAt, % reserved rows disagreeing with created_at',
      missing_anchor, published_mismatch, reserved_mismatch;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX "animals_wait_anchor_idx" ON "animals" USING btree ("wait_anchor_at","id") WHERE listing_kind IN ('published', 'reserved');--> statement-breakpoint
CREATE INDEX "animals_wait_anchor_filtered_idx" ON "animals" USING btree ("city_id","species","size","wait_anchor_at","id") WHERE listing_kind IN ('published', 'reserved');
