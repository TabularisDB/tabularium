-- Outbound notification webhooks. See sqlite migration for rationale.
CREATE TABLE webhooks (
 id text PRIMARY KEY NOT NULL,
 name text NOT NULL,
 enabled smallint DEFAULT 1 NOT NULL,
 preset text,
 events text NOT NULL,
 method text DEFAULT 'POST' NOT NULL,
 url text NOT NULL,
 headers text DEFAULT '[]' NOT NULL,
 body text,
 content_type text DEFAULT 'application/json' NOT NULL,
 secrets text,
 signing_secret text,
 created_at bigint NOT NULL,
 updated_at bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE webhook_deliveries (
 id text PRIMARY KEY NOT NULL,
 webhook_id text NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
 event text NOT NULL,
 payload text NOT NULL,
 status text DEFAULT 'pending' NOT NULL,
 attempts integer DEFAULT 0 NOT NULL,
 next_attempt_at bigint,
 last_status_code integer,
 last_error text,
 request text,
 response_body text,
 duration_ms integer,
 created_at bigint NOT NULL,
 completed_at bigint
);
--> statement-breakpoint
CREATE INDEX webhook_deliveries_webhook_created_idx ON webhook_deliveries(webhook_id, created_at);
--> statement-breakpoint
CREATE INDEX webhook_deliveries_status_next_idx ON webhook_deliveries(status, next_attempt_at);
