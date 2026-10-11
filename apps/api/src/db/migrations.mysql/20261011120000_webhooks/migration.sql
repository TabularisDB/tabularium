-- Outbound notification webhooks. See sqlite migration for rationale.
-- `headers` has no DEFAULT: MySQL rejects literal defaults on TEXT columns,
-- and the app always writes it.
CREATE TABLE webhooks (
 id varchar(64) PRIMARY KEY NOT NULL,
 name varchar(120) NOT NULL,
 enabled tinyint DEFAULT 1 NOT NULL,
 preset varchar(40),
 events text NOT NULL,
 method varchar(10) DEFAULT 'POST' NOT NULL,
 url text NOT NULL,
 headers text NOT NULL,
 body text,
 content_type varchar(120) DEFAULT 'application/json' NOT NULL,
 secrets text,
 signing_secret text,
 created_at bigint NOT NULL,
 updated_at bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE webhook_deliveries (
 id varchar(64) PRIMARY KEY NOT NULL,
 webhook_id varchar(64) NOT NULL,
 event varchar(80) NOT NULL,
 payload text NOT NULL,
 status varchar(16) DEFAULT 'pending' NOT NULL,
 attempts int DEFAULT 0 NOT NULL,
 next_attempt_at bigint,
 last_status_code int,
 last_error text,
 request text,
 response_body text,
 duration_ms int,
 created_at bigint NOT NULL,
 completed_at bigint,
 FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX webhook_deliveries_webhook_created_idx ON webhook_deliveries(webhook_id, created_at);
--> statement-breakpoint
CREATE INDEX webhook_deliveries_status_next_idx ON webhook_deliveries(status, next_attempt_at);
