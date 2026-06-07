-- Inter-plugin dependency list captured from the manifest's `requires[]`
-- field. Stored as a JSON-encoded array of
-- `{ id, version?, optional?, reason? }`. NULL when the manifest does not
-- declare any requirements OR when admins disable the field via
-- `plugins.requires_allowed=false`.
ALTER TABLE `plugins` ADD `requires` text;
