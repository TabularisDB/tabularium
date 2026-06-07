-- Discord-notifier plugin audit table: pl_discord_notifier__webhook_log.
-- Records every webhook send (status, http response, error if any) so admins
-- can debug Discord delivery without grepping app logs.
CREATE TABLE `pl_discord_notifier__webhook_log` (
	`id` text PRIMARY KEY NOT NULL,
	`event` text NOT NULL,
	`status` text NOT NULL,
	`http_status` integer,
	`error` text,
	`sent_at` integer NOT NULL
);--> statement-breakpoint
CREATE INDEX `pl_discord_notifier__webhook_log_sent_idx` ON `pl_discord_notifier__webhook_log` (`sent_at`);--> statement-breakpoint
CREATE INDEX `pl_discord_notifier__webhook_log_event_sent_idx` ON `pl_discord_notifier__webhook_log` (`event`,`sent_at`);
