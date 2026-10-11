-- Outbound notification webhooks (lib/webhooks). `webhook_deliveries` is both
-- the retry outbox and the admin-facing delivery log.
CREATE TABLE webhooks (
 id text PRIMARY KEY NOT NULL,
 name text NOT NULL,
 enabled integer DEFAULT 1 NOT NULL,
 preset text,
 events text NOT NULL,
 method text DEFAULT 'POST' NOT NULL,
 url text NOT NULL,
 headers text DEFAULT '[]' NOT NULL,
 body text,
 content_type text DEFAULT 'application/json' NOT NULL,
 secrets text,
 signing_secret text,
 created_at integer NOT NULL,
 updated_at integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE webhook_deliveries (
 id text PRIMARY KEY NOT NULL,
 webhook_id text NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
 event text NOT NULL,
 payload text NOT NULL,
 status text DEFAULT 'pending' NOT NULL,
 attempts integer DEFAULT 0 NOT NULL,
 next_attempt_at integer,
 last_status_code integer,
 last_error text,
 request text,
 response_body text,
 duration_ms integer,
 created_at integer NOT NULL,
 completed_at integer
);
--> statement-breakpoint
CREATE INDEX webhook_deliveries_webhook_created_idx ON webhook_deliveries(webhook_id, created_at);
--> statement-breakpoint
CREATE INDEX webhook_deliveries_status_next_idx ON webhook_deliveries(status, next_attempt_at);
