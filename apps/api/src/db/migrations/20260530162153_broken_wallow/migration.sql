CREATE TABLE `publisher_tokens` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`prefix` text NOT NULL,
	`token_hash` text NOT NULL,
	`scopes` text NOT NULL,
	`expires_at` integer,
	`last_used_at` integer,
	`created_at` integer NOT NULL,
	`revoked_at` integer,
	CONSTRAINT `fk_publisher_tokens_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `publisher_tokens_user_idx` ON `publisher_tokens` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `publisher_tokens_hash_uniq` ON `publisher_tokens` (`token_hash`);