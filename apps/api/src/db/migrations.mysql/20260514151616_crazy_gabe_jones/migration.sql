CREATE TABLE `plugin_request_claims` (
	`request_id` varchar(64) NOT NULL,
	`user_id` varchar(64) NOT NULL,
	`created_at` bigint NOT NULL,
	CONSTRAINT PRIMARY KEY(`request_id`,`user_id`),
	CONSTRAINT `plugin_request_claims_request_id_plugin_requests_id_fkey` FOREIGN KEY (`request_id`) REFERENCES `plugin_requests`(`id`) ON DELETE CASCADE,
	CONSTRAINT `plugin_request_claims_user_id_users_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
