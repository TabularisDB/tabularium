CREATE TABLE `admin_tokens` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`prefix` text NOT NULL,
	`token_hash` text NOT NULL,
	`scopes` text,
	`expires_at` integer,
	`last_used_at` integer,
	`created_at` integer NOT NULL,
	`revoked_at` integer,
	CONSTRAINT `fk_admin_tokens_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `admin_tokens_user_idx` ON `admin_tokens` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `admin_tokens_hash_uniq` ON `admin_tokens` (`token_hash`);