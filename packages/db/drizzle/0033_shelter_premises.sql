ALTER TABLE "shelters" DROP CONSTRAINT "shelters_verified_has_verified_data";--> statement-breakpoint
ALTER TABLE "shelters" ADD COLUMN "premises" text;--> statement-breakpoint
-- Backfill before the CHECKs: every address on file is premises at that address. No row without one is touched (NULL is not_recorded).
UPDATE "shelters" SET "premises" = 'address' WHERE "exact_address" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "shelters" ADD CONSTRAINT "shelters_premises_check" CHECK ("shelters"."premises" IN ('address', 'foster_homes'));--> statement-breakpoint
ALTER TABLE "shelters" ADD CONSTRAINT "shelters_premises_address_check" CHECK (("shelters"."premises" IS NOT DISTINCT FROM 'address') = ("shelters"."exact_address" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "shelters" ADD CONSTRAINT "shelters_foster_homes_initiative_only" CHECK ("shelters"."premises" IS DISTINCT FROM 'foster_homes' OR ("shelters"."legal_entity" ->> 'kind') IS NOT DISTINCT FROM 'unregistered_initiative');--> statement-breakpoint
ALTER TABLE "shelters" ADD CONSTRAINT "shelters_verified_has_verified_data" CHECK ("shelters"."verification_status" IN ('application', 'pending', 'under_review', 'rejected') OR ("shelters"."legal_entity" IS NOT NULL AND "shelters"."premises" IS NOT NULL));