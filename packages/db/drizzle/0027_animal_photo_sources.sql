CREATE TABLE "animal_photo_sources" (
	"storage_key" text PRIMARY KEY NOT NULL,
	"animal_id" text NOT NULL,
	"source_object_key" text NOT NULL,
	"source_origin" text NOT NULL,
	"source_width" integer NOT NULL,
	"source_height" integer NOT NULL,
	"frame_x" integer,
	"frame_y" integer,
	"frame_w" integer,
	"frame_h" integer,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "animal_photo_sources_object_key_check" CHECK (starts_with("animal_photo_sources"."source_object_key", "animal_photo_sources"."storage_key" || '/') AND substr("animal_photo_sources"."source_object_key", length("animal_photo_sources"."storage_key") + 2) ~ '^source-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'),
	CONSTRAINT "animal_photo_sources_origin_check" CHECK ("animal_photo_sources"."source_origin" IN ('upload', 'detail_variant')),
	CONSTRAINT "animal_photo_sources_size_check" CHECK ("animal_photo_sources"."source_width" > 0 AND "animal_photo_sources"."source_height" > 0),
	CONSTRAINT "animal_photo_sources_frame_check" CHECK (("animal_photo_sources"."frame_x" IS NULL AND "animal_photo_sources"."frame_y" IS NULL AND "animal_photo_sources"."frame_w" IS NULL AND "animal_photo_sources"."frame_h" IS NULL) OR ("animal_photo_sources"."frame_x" IS NOT NULL AND "animal_photo_sources"."frame_y" IS NOT NULL AND "animal_photo_sources"."frame_w" IS NOT NULL AND "animal_photo_sources"."frame_h" IS NOT NULL AND "animal_photo_sources"."frame_x" >= 0 AND "animal_photo_sources"."frame_y" >= 0 AND "animal_photo_sources"."frame_w" > 0 AND "animal_photo_sources"."frame_h" > 0 AND "animal_photo_sources"."frame_x" + "animal_photo_sources"."frame_w" <= 10000 AND "animal_photo_sources"."frame_y" + "animal_photo_sources"."frame_h" <= 10000))
);
--> statement-breakpoint
ALTER TABLE "animal_photo_sources" ADD CONSTRAINT "animal_photo_sources_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "animal_photo_sources_animal_idx" ON "animal_photo_sources" USING btree ("animal_id");