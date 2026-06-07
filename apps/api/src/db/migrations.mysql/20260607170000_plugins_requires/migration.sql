-- Inter-plugin dependency list captured from the manifest's `requires[]`
-- field. See sqlite migration for rationale.
ALTER TABLE `plugins` ADD `requires` text;
