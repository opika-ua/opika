CREATE TABLE "application_deletions" (
	"id" text PRIMARY KEY NOT NULL,
	"shelter_id" text NOT NULL,
	"reason" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	CONSTRAINT "application_deletions_reason_check" CHECK ("application_deletions"."reason" IN ('abandoned', 'rejected_expired', 'not_me'))
);
--> statement-breakpoint
CREATE TABLE "funnel_events" (
	"id" text PRIMARY KEY NOT NULL,
	"shelter_id" text,
	"kind" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	CONSTRAINT "funnel_events_kind_check" CHECK ("funnel_events"."kind" IN ('registered', 'email_confirmed', 'first_draft', 'approved', 'first_published'))
);
--> statement-breakpoint
CREATE TABLE "registration_email_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"purpose" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	CONSTRAINT "registration_email_tokens_purpose_check" CHECK ("registration_email_tokens"."purpose" IN ('confirm_email', 'not_me'))
);
--> statement-breakpoint
ALTER TABLE "shelters" DROP CONSTRAINT "shelters_verified_has_verified_data";--> statement-breakpoint
ALTER TABLE "shelters" ADD COLUMN "registration_source" text DEFAULT 'operator' NOT NULL;--> statement-breakpoint
ALTER TABLE "shelters" ADD COLUMN "registrant_user_id" text;--> statement-breakpoint
ALTER TABLE "shelters" ADD COLUMN "applied_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shelters" ADD COLUMN "application_rejected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "funnel_events" ADD CONSTRAINT "funnel_events_shelter_id_shelters_id_fk" FOREIGN KEY ("shelter_id") REFERENCES "public"."shelters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_email_tokens" ADD CONSTRAINT "registration_email_tokens_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "funnel_events_once_idx" ON "funnel_events" USING btree ("shelter_id","kind") WHERE "funnel_events"."shelter_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "funnel_events_at_idx" ON "funnel_events" USING btree ("at");--> statement-breakpoint
CREATE INDEX "registration_email_tokens_user_id_idx" ON "registration_email_tokens" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "shelters" ADD CONSTRAINT "shelters_registrant_user_id_auth_user_id_fk" FOREIGN KEY ("registrant_user_id") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shelters_application_queue_idx" ON "shelters" USING btree ("applied_at","id") WHERE "shelters"."verification_status" = 'application';--> statement-breakpoint
CREATE INDEX "shelters_application_rejected_idx" ON "shelters" USING btree ("application_rejected_at") WHERE "shelters"."application_rejected_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "shelters" ADD CONSTRAINT "shelters_registrant_user_id_unique" UNIQUE("registrant_user_id");--> statement-breakpoint
ALTER TABLE "shelters" ADD CONSTRAINT "shelters_registration_source_check" CHECK ("shelters"."registration_source" IN ('operator', 'self_registration'));--> statement-breakpoint
ALTER TABLE "shelters" ADD CONSTRAINT "shelters_self_registration_facts" CHECK (("shelters"."registration_source" = 'self_registration') = ("shelters"."applied_at" IS NOT NULL) AND ("shelters"."registrant_user_id" IS NULL OR "shelters"."registration_source" = 'self_registration'));--> statement-breakpoint
ALTER TABLE "shelters" ADD CONSTRAINT "shelters_application_is_self_registered" CHECK ("shelters"."verification_status" <> 'application' OR "shelters"."registration_source" = 'self_registration');--> statement-breakpoint
ALTER TABLE "shelters" ADD CONSTRAINT "shelters_application_rejected_at_check" CHECK ("shelters"."application_rejected_at" IS NULL OR ("shelters"."verification_status" = 'rejected' AND "shelters"."registration_source" = 'self_registration'));--> statement-breakpoint
ALTER TABLE "shelters" ADD CONSTRAINT "shelters_verified_has_verified_data" CHECK ("shelters"."verification_status" IN ('application', 'pending', 'under_review', 'rejected') OR ("shelters"."legal_entity" IS NOT NULL AND "shelters"."exact_address" IS NOT NULL));--> statement-breakpoint
-- Hand-written below drizzle-kit's output. Every stored rejection refused a verification: the
-- application stage did not exist before this migration (`RejectionStage`).
UPDATE "shelters" SET "verification" = "verification" || '{"stage":"verification"}'::jsonb WHERE "verification_status" = 'rejected' AND NOT ("verification" ? 'stage');--> statement-breakpoint
-- A rename line names an actor since shelters rename themselves (D4); every older line was the operator's.
UPDATE "shelter_history" SET "entry" = ("entry" - 'moderatorId') || jsonb_build_object('actor', jsonb_build_object('kind', 'moderator', 'moderatorId', "entry" -> 'moderatorId')) WHERE "kind" = 'display_name_changed' AND "entry" ? 'moderatorId';
