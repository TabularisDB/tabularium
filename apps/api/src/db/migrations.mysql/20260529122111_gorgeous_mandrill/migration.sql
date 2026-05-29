CREATE TABLE `admin_tokens` (
	`id` varchar(64) PRIMARY KEY,
	`user_id` varchar(64) NOT NULL,
	`name` varchar(80) NOT NULL,
	`prefix` varchar(24) NOT NULL,
	`token_hash` varchar(128) NOT NULL,
	`scopes` text,
	`expires_at` bigint,
	`last_used_at` bigint,
	`created_at` bigint NOT NULL,
	`revoked_at` bigint,
	CONSTRAINT `admin_tokens_hash_uniq` UNIQUE INDEX(`token_hash`),
	CONSTRAINT `admin_tokens_user_id_users_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE INDEX `admin_tokens_user_idx` ON `admin_tokens` (`user_id`);