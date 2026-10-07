DROP INDEX "animals_feed_idx";--> statement-breakpoint
DROP INDEX "animals_feed_unfiltered_idx";--> statement-breakpoint
ALTER TABLE "animals" ADD COLUMN "last_confirmed_at" timestamp with time zone;--> statement-breakpoint
--
-- H2-3 / H2-14 (Oleksii, 2026-10-07; inbox `docs/decisions-inbox/docs-h2-contract-proposal.md`):
-- freshness, the deck keyset and the gallery's `freshest` sort move from
-- `last_updated_at` (edit time) to a confirmation instant carried on the
-- listing itself (`listing.confirmedAt`, published/reserved only) and
-- denormalised into `last_confirmed_at` for the indexes.
--
-- Backfill value: `last_updated_at` (H2-14 → A), which preserves exactly the
-- freshness adopters see today. NOT `created_at`: a listing's creation is not
-- a confirmation (a draft is created before anyone says the animal is
-- available), and on the seeded corpus `created_at` precedes `publishedAt`.
--
-- Guard, per Oleksii: no row may end up confirmed before it was published.
-- Where `last_updated_at < publishedAt` the row gets
-- GREATEST(last_updated_at, publishedAt) instead, and the count is RAISEd as
-- a NOTICE so it is reported rather than silently corrected. Local corpus at
-- the time of writing: 0 such rows (224 published, 32 reserved).
DO $$
DECLARE
  raised integer;
BEGIN
  SELECT count(*) INTO raised
  FROM "animals"
  WHERE "listing_kind" IN ('published', 'reserved')
    AND "last_updated_at" < ("listing"->>'publishedAt')::timestamptz;
  RAISE NOTICE 'last_confirmed_at backfill: % row(s) had last_updated_at before publishedAt and are confirmed at publishedAt instead', raised;
END $$;--> statement-breakpoint
UPDATE "animals"
SET "listing" = jsonb_set(
  "listing",
  '{confirmedAt}',
  to_jsonb(to_char(
    GREATEST("last_updated_at", ("listing"->>'publishedAt')::timestamptz) AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  ))
)
WHERE "listing_kind" IN ('published', 'reserved')
  AND "listing"->'confirmedAt' IS NULL;--> statement-breakpoint
UPDATE "animals"
SET "last_confirmed_at" = ("listing"->>'confirmedAt')::timestamptz
WHERE "listing_kind" IN ('published', 'reserved');--> statement-breakpoint
--
-- Abort loudly rather than leave a discoverable row the keyset cannot order,
-- a column disagreeing with the listing it is derived from, or a confirmation
-- before publication.
DO $$
DECLARE
  missing integer;
  mismatched integer;
  before_published integer;
  on_invisible integer;
BEGIN
  SELECT count(*) INTO missing
  FROM "animals"
  WHERE "listing_kind" IN ('published', 'reserved') AND "last_confirmed_at" IS NULL;

  SELECT count(*) INTO mismatched
  FROM "animals"
  WHERE "listing_kind" IN ('published', 'reserved')
    AND "last_confirmed_at" IS DISTINCT FROM ("listing"->>'confirmedAt')::timestamptz;

  SELECT count(*) INTO before_published
  FROM "animals"
  WHERE "listing"->'publishedAt' IS NOT NULL
    AND "last_confirmed_at" < ("listing"->>'publishedAt')::timestamptz;

  SELECT count(*) INTO on_invisible
  FROM "animals"
  WHERE "listing_kind" NOT IN ('published', 'reserved')
    AND ("last_confirmed_at" IS NOT NULL OR "listing"->'confirmedAt' IS NOT NULL);

  IF missing > 0 OR mismatched > 0 OR before_published > 0 OR on_invisible > 0 THEN
    RAISE EXCEPTION
      'last_confirmed_at backfill is wrong: % discoverable rows unconfirmed, % disagreeing with listing.confirmedAt, % confirmed before publishedAt, % non-discoverable rows carrying a confirmation',
      missing, mismatched, before_published, on_invisible;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX "animals_feed_idx" ON "animals" USING btree ("listing_kind","city_id","species","size","last_confirmed_at","id");--> statement-breakpoint
CREATE INDEX "animals_feed_unfiltered_idx" ON "animals" USING btree ("last_confirmed_at" DESC NULLS FIRST,"id") WHERE listing_kind IN ('published', 'reserved');
