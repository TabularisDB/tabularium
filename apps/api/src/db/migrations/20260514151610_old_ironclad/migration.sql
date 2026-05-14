CREATE TABLE `plugin_request_claims` (
	`request_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `plugin_request_claims_pk` PRIMARY KEY(`request_id`, `user_id`),
	CONSTRAINT `fk_plugin_request_claims_request_id_plugin_requests_id_fk` FOREIGN KEY (`request_id`) REFERENCES `plugin_requests`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_plugin_request_claims_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
