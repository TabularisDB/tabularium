CREATE TABLE `email_preferences` (
	`user_id` text PRIMARY KEY,
	`prefs` text NOT NULL,
	`token_nonce` text NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_email_preferences_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `email_suppression` (
	`email` text PRIMARY KEY,
	`source` text NOT NULL,
	`reason` text,
	`added_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `users` ADD `email` text;--> statement-breakpoint
ALTER TABLE `users` ADD `locale` text DEFAULT 'en' NOT NULL;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text PRIMARY KEY,
	`display_name` text NOT NULL,
	`email` text UNIQUE,
	`locale` text DEFAULT 'en' NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_users`(`id`, `display_name`, `role`, `created_at`) SELECT `id`, `display_name`, `role`, `created_at` FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `email_suppression_source_idx` ON `email_suppression` (`source`);--> statement-breakpoint
UPDATE users
SET email = (SELECT email FROM root_credentials WHERE root_credentials.user_id = users.id)
WHERE email IS NULL
  AND EXISTS (SELECT 1 FROM root_credentials WHERE root_credentials.user_id = users.id);