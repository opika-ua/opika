ALTER TABLE "support_sessions" DROP CONSTRAINT "support_sessions_shelter_id_shelters_id_fk";
--> statement-breakpoint
ALTER TABLE "support_sessions" ALTER COLUMN "shelter_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_shelter_id_shelters_id_fk" FOREIGN KEY ("shelter_id") REFERENCES "public"."shelters"("id") ON DELETE set null ON UPDATE no action;