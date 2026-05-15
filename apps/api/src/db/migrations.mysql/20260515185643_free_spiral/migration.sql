CREATE TABLE `download_events` (
	`id` varchar(64) PRIMARY KEY,
	`plugin_id` varchar(64) NOT NULL,
	`version` varchar(80) NOT NULL,
	`platform` varchar(40) NOT NULL,
	`created_at` bigint NOT NULL,
	CONSTRAINT `download_events_plugin_created` UNIQUE INDEX(`plugin_id`,`created_at`,`id`),
	CONSTRAINT `download_events_plugin_id_plugins_id_fkey` FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`)
);
