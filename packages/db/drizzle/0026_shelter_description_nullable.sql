ALTER TABLE "shelters" ALTER COLUMN "description_uk" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "shelters" ADD CONSTRAINT "shelters_description_en_check"
  CHECK ("shelters"."description_uk" IS NOT NULL OR ("shelters"."description_en_text" IS NULL AND "shelters"."description_en_provenance" IS NULL));
