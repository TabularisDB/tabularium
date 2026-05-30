ALTER TABLE `releases` ADD `yanked_at` bigint;--> statement-breakpoint
ALTER TABLE `releases` ADD `yanked_by` varchar(64);--> statement-breakpoint
ALTER TABLE `releases` ADD `yank_reason` text;--> statement-breakpoint
CREATE INDEX `releases_yanked_at_idx` ON `releases` (`yanked_at`);--> statement-breakpoint
ALTER TABLE `releases` ADD CONSTRAINT `releases_yanked_by_users_id_fkey` FOREIGN KEY (`yanked_by`) REFERENCES `users`(`id`) ON DELETE SET NULL;