CREATE TABLE `email_preferences` (
	`user_id` varchar(64) PRIMARY KEY,
	`prefs` text NOT NULL,
	`token_nonce` varchar(64) NOT NULL,
	`updated_at` bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE `email_suppression` (
	`email` varchar(320) PRIMARY KEY,
	`source` varchar(16) NOT NULL,
	`reason` text,
	`added_at` bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE `users` ADD `email` varchar(320);--> statement-breakpoint
ALTER TABLE `users` ADD `locale` varchar(10) DEFAULT 'en' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `email_suppression_source_idx` ON `email_suppression` (`source`);--> statement-breakpoint
ALTER TABLE `email_preferences` ADD CONSTRAINT `email_preferences_user_id_users_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE;--> statement-breakpoint
UPDATE `users` u
INNER JOIN `root_credentials` rc ON rc.`user_id` = u.`id`
SET u.`email` = rc.`email`
WHERE u.`email` IS NULL;