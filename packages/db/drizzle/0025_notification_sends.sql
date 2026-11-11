CREATE TABLE "notification_sends" (
	"dedup_key" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"shelter_id" text,
	"recipient_user_id" text,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "notification_sends_status_check" CHECK ("notification_sends"."status" IN ('claimed', 'sent', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "shelters" ADD COLUMN "freshness_reminder_off_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification_sends" ADD CONSTRAINT "notification_sends_shelter_id_shelters_id_fk" FOREIGN KEY ("shelter_id") REFERENCES "public"."shelters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_sends" ADD CONSTRAINT "notification_sends_recipient_user_id_auth_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_sends_status_created_idx" ON "notification_sends" USING btree ("status","created_at");