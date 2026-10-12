-- H2 handlers slice (HS-Q6). Purely additive: new tables and one nullable
-- column, so there is nothing to backfill and no existing row changes.
--   * Better Auth's tables, all prefixed auth_ (HS-Q6, HS-T1), kabinet only;
--     adopters keep the `sessions` table (decision #13).
--   * super_admins: the only place the platform role lives (admin:grant /
--     admin:revoke write it; Better Auth never sees it).
--   * shelter_history: append-only, five pinned columns, no adopter/reveal/
--     swipe data ever (exact-field test in test/shelter-history.test.ts).
--   * shelters.organization_id: null until a shelter's first admin is invited.
CREATE TABLE "auth_account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"inviter_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"created_at" timestamp with time zone NOT NULL,
	"metadata" text,
	CONSTRAINT "auth_organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "auth_session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	CONSTRAINT "auth_session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "auth_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean NOT NULL,
	"image" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "auth_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "auth_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shelter_history" (
	"id" text PRIMARY KEY NOT NULL,
	"shelter_id" text NOT NULL,
	"kind" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"entry" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "super_admins" (
	"user_id" text PRIMARY KEY NOT NULL,
	"granted_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shelters" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "auth_account" ADD CONSTRAINT "auth_account_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_invitation" ADD CONSTRAINT "auth_invitation_organization_id_auth_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."auth_organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_invitation" ADD CONSTRAINT "auth_invitation_inviter_id_auth_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_member" ADD CONSTRAINT "auth_member_organization_id_auth_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."auth_organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_member" ADD CONSTRAINT "auth_member_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shelter_history" ADD CONSTRAINT "shelter_history_shelter_id_shelters_id_fk" FOREIGN KEY ("shelter_id") REFERENCES "public"."shelters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "super_admins" ADD CONSTRAINT "super_admins_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_account_user_id_idx" ON "auth_account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_invitation_organization_id_idx" ON "auth_invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "auth_invitation_email_idx" ON "auth_invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "auth_member_organization_id_idx" ON "auth_member" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_member_user_id_unique" ON "auth_member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_session_user_id_idx" ON "auth_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_verification_identifier_idx" ON "auth_verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "shelter_history_shelter_at_idx" ON "shelter_history" USING btree ("shelter_id","at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "shelters" ADD CONSTRAINT "shelters_organization_id_auth_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."auth_organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shelters" ADD CONSTRAINT "shelters_organization_id_unique" UNIQUE("organization_id");