CREATE TABLE `download_events` (
	`id` text PRIMARY KEY,
	`plugin_id` text NOT NULL,
	`version` text NOT NULL,
	`platform` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_download_events_plugin_id_plugins_id_fk` FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX `download_events_plugin_created` ON `download_events` (`plugin_id`,`created_at`,`id`);