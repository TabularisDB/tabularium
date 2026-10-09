-- Optional plugin kind on community requests. See sqlite migration for rationale.
ALTER TABLE "plugin_requests" ADD COLUMN "kind" text;
