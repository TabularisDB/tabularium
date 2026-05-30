ALTER TABLE `plugins` ADD `verified_at` bigint;--> statement-breakpoint
ALTER TABLE `plugins` ADD `verified_by` varchar(64);--> statement-breakpoint
CREATE INDEX `plugins_verified_at_idx` ON `plugins` (`verified_at`);--> statement-breakpoint
ALTER TABLE `plugins` ADD CONSTRAINT `plugins_verified_by_users_id_fkey` FOREIGN KEY (`verified_by`) REFERENCES `users`(`id`) ON DELETE SET NULL;