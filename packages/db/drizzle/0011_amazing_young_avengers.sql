-- H2 registry PR (one migration for the PR; frozen before any rehearsal, RS-R1).
--   * animals.version (S3-T6, Oleksii: "integer version for animals too (same as
--     shelters)"): the edit compare-and-set guard. Every existing row starts at 0,
--     as shelters.version did in 0008; listing moves never bump it.
--   * support_sessions (RG-Q4, RS-Q0): an operator's read-only view of one
--     shelter. Exactly the approved columns plus the cookie's token hash; no IP,
--     no user-agent; rows never deleted (no cascade from either FK).
--   * invitation_created_users (RG-Q3, RS-Q0): users an invitation created, so the
--     clean-up deletes only its own, and only if never signed in.
-- Purely additive. To be rehearsed on a child branch before production.
CREATE TABLE "invitation_created_users" (
	"user_id" text PRIMARY KEY NOT NULL,
	"invitation_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"first_session_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "support_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"operator_user_id" text NOT NULL,
	"shelter_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"end_reason" text,
	CONSTRAINT "support_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "animals" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invitation_created_users" ADD CONSTRAINT "invitation_created_users_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_created_users" ADD CONSTRAINT "invitation_created_users_invitation_id_auth_invitation_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."auth_invitation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_operator_user_id_auth_user_id_fk" FOREIGN KEY ("operator_user_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_shelter_id_shelters_id_fk" FOREIGN KEY ("shelter_id") REFERENCES "public"."shelters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "support_sessions_operator_idx" ON "support_sessions" USING btree ("operator_user_id");