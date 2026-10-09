-- Optional plugin kind on community requests (an admin-defined kind key, see
-- lib/kinds). NULL for requests created before this column existed or when the
-- requester didn't pick one.
ALTER TABLE `plugin_requests` ADD `kind` text;
