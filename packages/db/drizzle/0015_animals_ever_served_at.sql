-- S8-F5: the precise fact `animals.cardsByIds`'s `wasEverPublic` approximation
-- couldn't express — "was this exact listing ever actually rendered to an
-- adopter", not "has the shelter ever been verified at all". Set once, by
-- `everServedAtAfter`, never cleared by a later withdrawal or suspension.
ALTER TABLE "animals" ADD COLUMN "ever_served_at" timestamp with time zone;--> statement-breakpoint
--
-- Backfill, on current state only, not reconstructed history: every row
-- that is, right now, exactly what `buildDiscoverabilityPredicate`
-- (packages/db/src/repos/feed-predicate.ts) requires for a real adopter
-- surface to show it. The production registry holds no real shelter yet
-- (demo + rehearsal data only, wiped before the first one), so there is
-- nothing to under- or over-count that matters here, and "currently
-- served" is itself the strongest evidence available for a row that
-- genuinely is being served right now.
UPDATE "animals"
SET "ever_served_at" = now()
WHERE "listing_kind" IN ('published', 'reserved')
  AND "shelter_id" IN (SELECT "id" FROM "shelters" WHERE "verification_status" = 'verified');
