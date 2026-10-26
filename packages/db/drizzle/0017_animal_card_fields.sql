-- The pet card's temperament, coat colour and medical note. Additive, no
-- backfill: every existing row reads as not recorded (an empty temperament,
-- no colour, no note), because a value written for an animal nobody described
-- would be an invented fact. `temperament_traits` holds the filterable
-- presets in order; a custom temperament and a custom colour are the
-- shelter's own words, in the same three-column Ukrainian/English layout as
-- the description, with the same English-needs-Ukrainian CHECK.
ALTER TABLE "animals" ADD COLUMN "temperament_traits" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "animals" ADD COLUMN "temperament_custom_uk" text;--> statement-breakpoint
ALTER TABLE "animals" ADD COLUMN "temperament_custom_en_text" text;--> statement-breakpoint
ALTER TABLE "animals" ADD COLUMN "temperament_custom_en_provenance" text;--> statement-breakpoint
ALTER TABLE "animals" ADD COLUMN "coat_colour" text;--> statement-breakpoint
ALTER TABLE "animals" ADD COLUMN "coat_colour_custom_uk" text;--> statement-breakpoint
ALTER TABLE "animals" ADD COLUMN "coat_colour_custom_en_text" text;--> statement-breakpoint
ALTER TABLE "animals" ADD COLUMN "coat_colour_custom_en_provenance" text;--> statement-breakpoint
ALTER TABLE "animals" ADD COLUMN "medical_notes_uk" text;--> statement-breakpoint
ALTER TABLE "animals" ADD COLUMN "medical_notes_en_text" text;--> statement-breakpoint
ALTER TABLE "animals" ADD COLUMN "medical_notes_en_provenance" text;--> statement-breakpoint
CREATE INDEX "animals_temperament_traits_idx" ON "animals" USING gin ("temperament_traits") WHERE listing_kind IN ('published', 'reserved');--> statement-breakpoint
CREATE INDEX "animals_coat_colour_idx" ON "animals" USING btree ("coat_colour") WHERE listing_kind IN ('published', 'reserved');--> statement-breakpoint
ALTER TABLE "animals" ADD CONSTRAINT "animals_coat_colour_one_kind_check" CHECK ("animals"."coat_colour" IS NULL OR "animals"."coat_colour_custom_uk" IS NULL);--> statement-breakpoint
ALTER TABLE "animals" ADD CONSTRAINT "animals_temperament_custom_en_check" CHECK ("animals"."temperament_custom_uk" IS NOT NULL OR ("animals"."temperament_custom_en_text" IS NULL AND "animals"."temperament_custom_en_provenance" IS NULL));--> statement-breakpoint
ALTER TABLE "animals" ADD CONSTRAINT "animals_coat_colour_custom_en_check" CHECK ("animals"."coat_colour_custom_uk" IS NOT NULL OR ("animals"."coat_colour_custom_en_text" IS NULL AND "animals"."coat_colour_custom_en_provenance" IS NULL));--> statement-breakpoint
ALTER TABLE "animals" ADD CONSTRAINT "animals_medical_notes_en_check" CHECK ("animals"."medical_notes_uk" IS NOT NULL OR ("animals"."medical_notes_en_text" IS NULL AND "animals"."medical_notes_en_provenance" IS NULL));