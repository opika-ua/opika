-- The operator's «Видалити притулок» (owner, 2026-11-20) leaves its audit line here: a fourth
-- reason and the operator's account id, set exactly when the reason is operator_removed. Additive:
-- a nullable column and a widened CHECK; every existing row satisfies both new constraints.
ALTER TABLE "application_deletions" DROP CONSTRAINT "application_deletions_reason_check";--> statement-breakpoint
ALTER TABLE "application_deletions" ADD COLUMN "operator_user_id" text;--> statement-breakpoint
ALTER TABLE "application_deletions" ADD CONSTRAINT "application_deletions_operator_check" CHECK (("application_deletions"."reason" = 'operator_removed') = ("application_deletions"."operator_user_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "application_deletions" ADD CONSTRAINT "application_deletions_reason_check" CHECK ("application_deletions"."reason" IN ('abandoned', 'rejected_expired', 'not_me', 'operator_removed'));