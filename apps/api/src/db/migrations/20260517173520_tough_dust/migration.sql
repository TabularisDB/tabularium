CREATE TABLE IF NOT EXISTS `release_assets` (
	`id` text PRIMARY KEY,
	`release_id` text NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`content_type` text,
	`arch` text,
	`os` text,
	`attestation_bundle` text,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_release_assets_release_id_releases_id_fk` FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `release_assets_release_name` ON `release_assets` (`release_id`,`name`);