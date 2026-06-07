-- Kernel-enforced plugin table prefix: email_* → pl_email__*
-- Hand-written RENAME (not DROP+CREATE) to preserve any existing data.
ALTER TABLE `email_log` RENAME TO `pl_email__log`;--> statement-breakpoint
ALTER TABLE `email_preferences` RENAME TO `pl_email__preferences`;--> statement-breakpoint
ALTER TABLE `email_suppression` RENAME TO `pl_email__suppression`;--> statement-breakpoint
-- SQLite doesn't auto-rename indexes when a table is renamed. Drop+recreate
-- with the new prefixed names so they line up with the schema definition.
DROP INDEX IF EXISTS `email_log_user_sent_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `email_log_mid_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `email_log_trigger_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `email_suppression_source_idx`;--> statement-breakpoint
CREATE INDEX `pl_email__log_user_sent_idx` ON `pl_email__log` (`user_id`,`sent_at`);--> statement-breakpoint
CREATE INDEX `pl_email__log_mid_idx` ON `pl_email__log` (`provider_mid`);--> statement-breakpoint
CREATE INDEX `pl_email__log_trigger_idx` ON `pl_email__log` (`trigger`,`sent_at`);--> statement-breakpoint
CREATE INDEX `pl_email__suppression_source_idx` ON `pl_email__suppression` (`source`);
