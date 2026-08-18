-- README markdown captured at each release's tag, so an older version can be
-- read exactly as it shipped instead of showing whatever the plugin's current
-- README happens to be. Raw markdown, or a JSON locale map when the manifest
-- declares `readmes`. NULL on releases ingested before this column existed.
ALTER TABLE `releases` ADD `readme` text;
