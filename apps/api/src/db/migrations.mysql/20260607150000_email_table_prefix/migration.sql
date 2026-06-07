-- Kernel-enforced plugin table prefix: email_* → pl_email__*
-- Hand-written RENAME (not DROP+CREATE) to preserve any existing data.
RENAME TABLE `email_log` TO `pl_email__log`;--> statement-breakpoint
RENAME TABLE `email_preferences` TO `pl_email__preferences`;--> statement-breakpoint
RENAME TABLE `email_suppression` TO `pl_email__suppression`;--> statement-breakpoint
-- In MySQL, indexes follow the table on RENAME (no separate rename needed).
-- The index names stay `email_log_user_sent_idx` etc. Drop+recreate so they
-- match the schema-defined names.
ALTER TABLE `pl_email__log` DROP INDEX `email_log_user_sent_idx`;--> statement-breakpoint
ALTER TABLE `pl_email__log` DROP INDEX `email_log_mid_idx`;--> statement-breakpoint
ALTER TABLE `pl_email__log` DROP INDEX `email_log_trigger_idx`;--> statement-breakpoint
ALTER TABLE `pl_email__suppression` DROP INDEX `email_suppression_source_idx`;--> statement-breakpoint
CREATE INDEX `pl_email__log_user_sent_idx` ON `pl_email__log` (`user_id`,`sent_at`);--> statement-breakpoint
CREATE INDEX `pl_email__log_mid_idx` ON `pl_email__log` (`provider_mid`);--> statement-breakpoint
CREATE INDEX `pl_email__log_trigger_idx` ON `pl_email__log` (`trigger`,`sent_at`);--> statement-breakpoint
CREATE INDEX `pl_email__suppression_source_idx` ON `pl_email__suppression` (`source`);
