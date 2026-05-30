CREATE TABLE `publisher_tokens` (
	`id` varchar(64) PRIMARY KEY,
	`user_id` varchar(64) NOT NULL,
	`name` varchar(80) NOT NULL,
	`prefix` varchar(24) NOT NULL,
	`token_hash` varchar(128) NOT NULL,
	`scopes` text NOT NULL,
	`expires_at` bigint,
	`last_used_at` bigint,
	`created_at` bigint NOT NULL,
	`revoked_at` bigint,
	CONSTRAINT `publisher_tokens_hash_uniq` UNIQUE INDEX(`token_hash`),
	CONSTRAINT `publisher_tokens_user_id_users_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE INDEX `publisher_tokens_user_idx` ON `publisher_tokens` (`user_id`);