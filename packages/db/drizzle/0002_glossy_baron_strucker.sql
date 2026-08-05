CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"adopter_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_adopter_id_adopters_id_fk" FOREIGN KEY ("adopter_id") REFERENCES "public"."adopters"("id") ON DELETE no action ON UPDATE no action;