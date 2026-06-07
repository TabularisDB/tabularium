-- Kernel-enforced plugin table prefix: email_* → pl_email__*
-- Hand-written RENAME (not DROP+CREATE) to preserve any existing data.
ALTER TABLE "email_log" RENAME TO "pl_email__log";--> statement-breakpoint
ALTER TABLE "email_preferences" RENAME TO "pl_email__preferences";--> statement-breakpoint
ALTER TABLE "email_suppression" RENAME TO "pl_email__suppression";--> statement-breakpoint
-- Indexes are auto-followed by Postgres on RENAME TABLE, but their own
-- names don't change — rename them explicitly so they match the schema.
ALTER INDEX "email_log_user_sent_idx" RENAME TO "pl_email__log_user_sent_idx";--> statement-breakpoint
ALTER INDEX "email_log_mid_idx" RENAME TO "pl_email__log_mid_idx";--> statement-breakpoint
ALTER INDEX "email_log_trigger_idx" RENAME TO "pl_email__log_trigger_idx";--> statement-breakpoint
ALTER INDEX "email_suppression_source_idx" RENAME TO "pl_email__suppression_source_idx";
