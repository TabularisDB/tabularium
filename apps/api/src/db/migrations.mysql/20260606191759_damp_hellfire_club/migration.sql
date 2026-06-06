CREATE TABLE `email_log` (
	`id` varchar(64) PRIMARY KEY,
	`user_id` varchar(64),
	`trigger` varchar(80) NOT NULL,
	`template` varchar(80) NOT NULL,
	`locale` varchar(16) NOT NULL,
	`to_address` varchar(320) NOT NULL,
	`from_address` varchar(320) NOT NULL,
	`subject` varchar(500) NOT NULL,
	`provider` varchar(40) NOT NULL,
	`provider_mid` varchar(255),
	`status` varchar(40) NOT NULL,
	`error` text,
	`sent_at` bigint NOT NULL,
	CONSTRAINT `email_log_user_id_users_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE INDEX `email_log_user_sent_idx` ON `email_log` (`user_id`,`sent_at`);--> statement-breakpoint
CREATE INDEX `email_log_mid_idx` ON `email_log` (`provider_mid`);--> statement-breakpoint
CREATE INDEX `email_log_trigger_idx` ON `email_log` (`trigger`,`sent_at`);