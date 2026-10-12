ALTER TABLE "shelters" ADD COLUMN "pending_donation" jsonb;--> statement-breakpoint
--
-- H2 S2b. Two JSONB shape changes, both hand-written (drizzle-kit can't see
-- inside JSONB):
--
-- 1. `pausedBy` becomes an actor. Every pause written before H2 was entered by
--    the operator (shelters had no login), so each one becomes
--    { "kind": "moderator", "moderatorId": <the id it already held> }. That's
--    both the top-level field on a paused shelter and the one carried inside a
--    suspended shelter's `priorState`, which is what reinstatement restores.
--
-- 2. A withdrawn listing's `reason` becomes { code, note } (H2-12). Each row
--    keeps its own code with "note": null (H2-13, Oleksii: "keep each withdrawn
--    row's existing code, note: null"). Overwriting codes with "other" would
--    have destroyed real data.
--
-- Rewrites only rows still in the old shape (`jsonb_typeof(...) = 'string'`),
-- so a row already in the new shape is left exactly as it is.
UPDATE "shelters"
SET "verification" = jsonb_set(
  "verification",
  '{pausedBy}',
  jsonb_build_object('kind', 'moderator', 'moderatorId', "verification"->'pausedBy')
)
WHERE "verification"->>'status' = 'paused'
  AND jsonb_typeof("verification"->'pausedBy') = 'string';--> statement-breakpoint
UPDATE "shelters"
SET "verification" = jsonb_set(
  "verification",
  '{priorState,pausedBy}',
  jsonb_build_object('kind', 'moderator', 'moderatorId', "verification"->'priorState'->'pausedBy')
)
WHERE "verification"->>'status' = 'suspended'
  AND "verification"->'priorState'->>'status' = 'paused'
  AND jsonb_typeof("verification"->'priorState'->'pausedBy') = 'string';--> statement-breakpoint
UPDATE "animals"
SET "listing" = jsonb_set(
  "listing",
  '{reason}',
  jsonb_build_object('code', "listing"->'reason', 'note', 'null'::jsonb)
)
WHERE "listing_kind" = 'withdrawn'
  AND jsonb_typeof("listing"->'reason') = 'string';--> statement-breakpoint
--
-- Abort loudly rather than leave a row in a shape the domain no longer reads,
-- or a withdrawal code the domain doesn't know.
DO $$
DECLARE
  bare_paused_by integer;
  bare_prior_paused_by integer;
  bare_reason integer;
  unknown_code integer;
BEGIN
  SELECT count(*) INTO bare_paused_by
  FROM "shelters"
  WHERE "verification"->>'status' = 'paused'
    AND ("verification"->'pausedBy'->>'kind') IS DISTINCT FROM 'moderator'
    AND ("verification"->'pausedBy'->>'kind') IS DISTINCT FROM 'shelter_admin';

  SELECT count(*) INTO bare_prior_paused_by
  FROM "shelters"
  WHERE "verification"->>'status' = 'suspended'
    AND "verification"->'priorState'->>'status' = 'paused'
    AND ("verification"->'priorState'->'pausedBy'->>'kind') IS DISTINCT FROM 'moderator'
    AND ("verification"->'priorState'->'pausedBy'->>'kind') IS DISTINCT FROM 'shelter_admin';

  SELECT count(*) INTO bare_reason
  FROM "animals"
  WHERE "listing_kind" = 'withdrawn'
    AND jsonb_typeof("listing"->'reason') IS DISTINCT FROM 'object';

  SELECT count(*) INTO unknown_code
  FROM "animals"
  WHERE "listing_kind" = 'withdrawn'
    -- COALESCE: a reason with no code (or "code": null) would otherwise slip
    -- through, since NULL NOT IN (...) is NULL, not true.
    AND COALESCE("listing"->'reason'->>'code', '') NOT IN
      ('adopted_elsewhere', 'transferred', 'deceased', 'listing_error', 'other');

  IF bare_paused_by > 0 OR bare_prior_paused_by > 0 OR bare_reason > 0 OR unknown_code > 0 THEN
    RAISE EXCEPTION
      'H2 S2b reshape is incomplete: % paused shelters without an actor, % suspended-from-paused shelters without an actor, % withdrawn rows without an object reason, % withdrawn rows with an unknown code',
      bare_paused_by, bare_prior_paused_by, bare_reason, unknown_code;
  END IF;
END $$;
