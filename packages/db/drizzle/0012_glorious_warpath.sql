-- K milestone PR 4 (K3), F-B1 / K-Q5 (Oleksii: "name + species to create; everything else
-- and ≥1 photo to publish"). A draft may lack its size, age and description; a listing that
-- was ever published may not. The three CHECKs make the database refuse what the domain union
-- refuses. Every existing row already has all four values (they were NOT NULL), so there is
-- no backfill and each CHECK validates as it is added. Approved as D1 (Oleksii: "approved as
-- in §2.3"); rollback and its limit in docs/k3-draft-shapes.md §2.5.
ALTER TABLE "animals" ALTER COLUMN "size" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "animals" ALTER COLUMN "age" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "animals" ALTER COLUMN "age_anchor_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "animals" ALTER COLUMN "description_uk" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "animals" ADD CONSTRAINT "animals_listing_facts_check" CHECK ("animals"."listing_kind" = 'draft' OR ("animals"."size" IS NOT NULL AND "animals"."age" IS NOT NULL AND "animals"."description_uk" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "animals" ADD CONSTRAINT "animals_age_anchor_check" CHECK (("animals"."age" IS NULL) = ("animals"."age_anchor_at" IS NULL));--> statement-breakpoint
ALTER TABLE "animals" ADD CONSTRAINT "animals_description_en_check" CHECK ("animals"."description_uk" IS NOT NULL OR ("animals"."description_en_text" IS NULL AND "animals"."description_en_provenance" IS NULL));