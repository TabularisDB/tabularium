CREATE TABLE `release_assets` (
	`id` varchar(64) PRIMARY KEY,
	`release_id` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`url` varchar(500) NOT NULL,
	`size` bigint NOT NULL,
	`sha256` varchar(64) NOT NULL,
	`content_type` varchar(120),
	`arch` varchar(40),
	`os` varchar(40),
	`attestation_bundle` text,
	`created_at` bigint NOT NULL,
	CONSTRAINT `release_assets_release_name` UNIQUE INDEX(`release_id`,`name`)
);
--> statement-breakpoint
ALTER TABLE `release_assets` ADD CONSTRAINT `release_assets_release_id_releases_id_fkey` FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON DELETE CASCADE;
