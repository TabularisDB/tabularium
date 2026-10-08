CREATE TABLE oauth_records (
 id varchar(64) PRIMARY KEY NOT NULL,
 kind varchar(16) NOT NULL,
 user_id varchar(64),
 payload text NOT NULL,
 expires_at bigint NOT NULL,
 consumed_by varchar(64),
 revoked_at bigint,
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX oauth_records_user_idx ON oauth_records(user_id);
--> statement-breakpoint
CREATE INDEX oauth_records_expiry_idx ON oauth_records(expires_at);
