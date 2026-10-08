CREATE TABLE oauth_records (
 id text PRIMARY KEY NOT NULL,
 kind text NOT NULL,
 user_id text REFERENCES users(id) ON DELETE CASCADE,
 payload text NOT NULL,
 expires_at bigint NOT NULL,
 consumed_by text,
 revoked_at bigint
);
--> statement-breakpoint
CREATE INDEX oauth_records_user_idx ON oauth_records(user_id);
--> statement-breakpoint
CREATE INDEX oauth_records_expiry_idx ON oauth_records(expires_at);
