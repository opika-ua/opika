-- PW1-F5 (Tier 1, a launch-gate item). Writing a shelter admin's password ends every one of
-- their kabinet sessions inside the statement that writes it, so the revoke can't fail on its own:
-- the password and the sign-outs are one transaction (a statement is its own transaction, on
-- neon-http as on postgres-js, and an AFTER ROW trigger runs inside it). Better Auth's own
-- revokes stay as a second line (`revokeSessionsOnPasswordReset`; a change's
-- `revokeOtherSessions`, forced on in `apps/web/src/kabinet/password-hooks.ts`), but they are
-- separate statements after the write, so before this a failed one left the sessions alive, for
-- up to 90 days (Oleksii, 2026-10-20, his PW1-F1 answer, verbatim excerpt: "If it's revoking
-- sessions on reset: (i), the trigger, Tier 1, as an additive migration with a real-Neon check. A
-- failed revoke would leave a session alive for up to 90 days, which is worth atomicity.").
-- Additive: a function and two triggers, no table or column change.
--
-- **Every session, the caller's included, on a change too.** Better Auth 1.6.33's change (with
-- `revokeOtherSessions`) already deletes every session of the user, the caller's included, and
-- then creates a new one for the caller (`dist/api/routes/update-user.mjs`), so this deletes
-- exactly the rows it would, one statement earlier; the new session is written after it. A
-- reset keeps none: Better Auth ends every one. Recorded in docs/decisions-inbox (PW1-F5-D1).
--
-- **Only a credential's password, only when it changes.** A password is first written by an
-- INSERT (a reset for an admin who has none: Better Auth's `createAccount`) and then by an
-- UPDATE (a later reset's `updatePassword`, a change's `updateAccount`). Rows for any other
-- provider, an UPDATE that leaves the hash as it was, and every other column fire nothing. A
-- sign-in only reads the account, so it ends nobody's session.
--
-- SECURITY INVOKER: the DELETE runs with the privileges of whoever writes the password, so a
-- role that may write `auth_account` but not delete from `auth_session` has its password write
-- refused rather than done without the revoke. The table is named in full and `search_path` is
-- empty, so no relation another schema puts first can stand in for `auth_session`.
-- CREATE OR REPLACE: the test databases drop the tables between runs but not functions.
CREATE OR REPLACE FUNCTION "public"."auth_account_password_revokes_sessions"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM "public"."auth_session" WHERE "user_id" = NEW."user_id";
  RETURN NULL;
END
$$;--> statement-breakpoint
CREATE TRIGGER "auth_account_password_insert_revokes_sessions"
AFTER INSERT ON "public"."auth_account"
FOR EACH ROW
WHEN (NEW."provider_id" = 'credential' AND NEW."password" IS NOT NULL)
EXECUTE FUNCTION "public"."auth_account_password_revokes_sessions"();--> statement-breakpoint
CREATE TRIGGER "auth_account_password_update_revokes_sessions"
AFTER UPDATE OF "password" ON "public"."auth_account"
FOR EACH ROW
WHEN (NEW."provider_id" = 'credential' AND NEW."password" IS DISTINCT FROM OLD."password")
EXECUTE FUNCTION "public"."auth_account_password_revokes_sessions"();
