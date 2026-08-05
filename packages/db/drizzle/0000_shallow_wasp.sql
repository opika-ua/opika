CREATE TABLE "adopters" (
	"id" text PRIMARY KEY NOT NULL,
	"identity_kind" text NOT NULL,
	"device_session_id" text,
	"account_id" text,
	"email" text,
	"country" text NOT NULL,
	"preferred_locale" text NOT NULL,
	"saved_filters" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "adopters_device_session_id_unique" UNIQUE("device_session_id"),
	CONSTRAINT "adopters_account_id_unique" UNIQUE("account_id"),
	CONSTRAINT "adopters_identity_check" CHECK (("adopters"."identity_kind" = 'anonymous' AND "adopters"."device_session_id" IS NOT NULL AND "adopters"."account_id" IS NULL)
       OR ("adopters"."identity_kind" = 'account' AND "adopters"."account_id" IS NOT NULL AND "adopters"."email" IS NOT NULL AND "adopters"."device_session_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "animals" (
	"id" text PRIMARY KEY NOT NULL,
	"shelter_id" text NOT NULL,
	"name" text NOT NULL,
	"species" text NOT NULL,
	"sex" text NOT NULL,
	"size" text NOT NULL,
	"age" jsonb NOT NULL,
	"age_anchor_at" timestamp with time zone NOT NULL,
	"description_uk" text NOT NULL,
	"description_en_text" text,
	"description_en_provenance" text,
	"photos" jsonb NOT NULL,
	"vaccination" jsonb NOT NULL,
	"spay_neuter" jsonb NOT NULL,
	"document_readiness" jsonb NOT NULL,
	"listing" jsonb NOT NULL,
	"listing_kind" text NOT NULL,
	"city_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"last_updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cities" (
	"id" text PRIMARY KEY NOT NULL,
	"name_uk" text NOT NULL,
	"name_en_text" text,
	"name_en_provenance" text,
	"centroid_lat" double precision NOT NULL,
	"centroid_lng" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reveals" (
	"id" text PRIMARY KEY NOT NULL,
	"adopter_id" text NOT NULL,
	"animal_id" text NOT NULL,
	"shelter_id" text NOT NULL,
	"revealed_at" timestamp with time zone NOT NULL,
	"shelter_snapshot" jsonb NOT NULL,
	"animal_snapshot" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shelters" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"description_uk" text NOT NULL,
	"description_en_text" text,
	"description_en_provenance" text,
	"legal_entity" jsonb NOT NULL,
	"public_location" jsonb NOT NULL,
	"exact_address" jsonb NOT NULL,
	"contact" jsonb NOT NULL,
	"donation" jsonb,
	"verification_status" text NOT NULL,
	"verification" jsonb NOT NULL,
	"city_id" text NOT NULL,
	"exact_lat" text NOT NULL,
	"exact_lng" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"last_updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "swipes" (
	"adopter_id" text NOT NULL,
	"animal_id" text NOT NULL,
	"direction" text NOT NULL,
	"swiped_at" timestamp with time zone NOT NULL,
	CONSTRAINT "swipes_adopter_id_animal_id_pk" PRIMARY KEY("adopter_id","animal_id")
);
--> statement-breakpoint
ALTER TABLE "animals" ADD CONSTRAINT "animals_shelter_id_shelters_id_fk" FOREIGN KEY ("shelter_id") REFERENCES "public"."shelters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animals" ADD CONSTRAINT "animals_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reveals" ADD CONSTRAINT "reveals_adopter_id_adopters_id_fk" FOREIGN KEY ("adopter_id") REFERENCES "public"."adopters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reveals" ADD CONSTRAINT "reveals_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reveals" ADD CONSTRAINT "reveals_shelter_id_shelters_id_fk" FOREIGN KEY ("shelter_id") REFERENCES "public"."shelters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shelters" ADD CONSTRAINT "shelters_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swipes" ADD CONSTRAINT "swipes_adopter_id_adopters_id_fk" FOREIGN KEY ("adopter_id") REFERENCES "public"."adopters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swipes" ADD CONSTRAINT "swipes_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "animals_shelter_id_idx" ON "animals" USING btree ("shelter_id");--> statement-breakpoint
CREATE INDEX "animals_feed_idx" ON "animals" USING btree ("listing_kind","city_id","species","size","last_updated_at","id");--> statement-breakpoint
CREATE INDEX "animals_feed_unfiltered_idx" ON "animals" USING btree ("last_updated_at" DESC NULLS FIRST,"id") WHERE listing_kind IN ('published', 'reserved');--> statement-breakpoint
CREATE INDEX "reveals_adopter_id_idx" ON "reveals" USING btree ("adopter_id","revealed_at");--> statement-breakpoint
CREATE INDEX "reveals_shelter_id_idx" ON "reveals" USING btree ("shelter_id");--> statement-breakpoint
CREATE INDEX "reveals_adopter_animal_idx" ON "reveals" USING btree ("adopter_id","animal_id");--> statement-breakpoint
CREATE INDEX "shelters_city_id_idx" ON "shelters" USING btree ("city_id");--> statement-breakpoint
CREATE INDEX "shelters_verification_status_idx" ON "shelters" USING btree ("verification_status");--> statement-breakpoint
CREATE INDEX "swipes_adopter_direction_idx" ON "swipes" USING btree ("adopter_id","direction","swiped_at");