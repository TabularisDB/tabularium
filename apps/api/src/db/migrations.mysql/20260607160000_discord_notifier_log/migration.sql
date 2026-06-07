-- Discord-notifier plugin audit table: pl_discord_notifier__webhook_log.
-- See sqlite migration for rationale.
CREATE TABLE `pl_discord_notifier__webhook_log` (
	`id` varchar(64) NOT NULL,
	`event` varchar(80) NOT NULL,
	`status` varchar(16) NOT NULL,
	`http_status` int,
	`error` text,
	`sent_at` bigint NOT NULL,
	CONSTRAINT `pl_discord_notifier__webhook_log_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE INDEX `pl_discord_notifier__webhook_log_sent_idx` ON `pl_discord_notifier__webhook_log` (`sent_at`);--> statement-breakpoint
CREATE INDEX `pl_discord_notifier__webhook_log_event_sent_idx` ON `pl_discord_notifier__webhook_log` (`event`,`sent_at`);
