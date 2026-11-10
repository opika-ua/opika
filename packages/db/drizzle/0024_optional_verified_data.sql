ALTER TABLE "shelters" ALTER COLUMN "legal_entity" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "shelters" ALTER COLUMN "exact_address" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "shelters" ALTER COLUMN "exact_lat" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "shelters" ALTER COLUMN "exact_lng" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "shelters" ADD CONSTRAINT "shelters_exact_point_all_or_none" CHECK (("shelters"."exact_lat" IS NULL) = ("shelters"."exact_lng" IS NULL));--> statement-breakpoint
ALTER TABLE "shelters" ADD CONSTRAINT "shelters_exact_point_needs_address" CHECK ("shelters"."exact_lat" IS NULL OR "shelters"."exact_address" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "shelters" ADD CONSTRAINT "shelters_verified_has_verified_data" CHECK ("shelters"."verification_status" IN ('pending', 'under_review', 'rejected') OR ("shelters"."legal_entity" IS NOT NULL AND "shelters"."exact_address" IS NOT NULL));